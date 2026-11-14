import { app } from "electron";
import { unlinkSync } from "node:fs";
import { backupSettingsFile, readSettingsFile, writeSettingsFile } from "./settings-file";

const SETTINGS_WRITE_DELAY_MS = 250;

type PendingSettingsWrite = {
	value: unknown;
	timer?: ReturnType<typeof setTimeout>;
	waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
};

let pendingSettingsWrite: PendingSettingsWrite | undefined;

export function getSetting<T = unknown>(path: string, options: { backupCorrupt?: boolean } = {}): T | undefined {
	return readSettingsFile(fileFor(path), options);
}

export function setSetting(path: string, value: unknown): Promise<void> {
	const file = fileFor(path);
	if (path !== "settings.json") {
		try {
			writeJson(file, value);
			return Promise.resolve();
		} catch (err) {
			return Promise.reject(err);
		}
	}

	return new Promise((resolve, reject) => {
		if (pendingSettingsWrite) {
			clearTimeout(pendingSettingsWrite.timer);
			pendingSettingsWrite.value = value;
			pendingSettingsWrite.waiters.push({ resolve, reject });
		} else {
			pendingSettingsWrite = {
				value,
				waiters: [{ resolve, reject }],
			};
		}
		pendingSettingsWrite.timer = setTimeout(
			() => void flushPendingSettings().catch(() => undefined),
			SETTINGS_WRITE_DELAY_MS,
		);
	});
}

export async function flushPendingSettings(): Promise<void> {
	const pending = pendingSettingsWrite;
	if (!pending) return;
	if (pending.timer) clearTimeout(pending.timer);
	pendingSettingsWrite = undefined;

	try {
		writeJson(fileFor("settings.json"), pending.value);
		for (const waiter of pending.waiters) waiter.resolve();
	} catch (err) {
		for (const waiter of pending.waiters) waiter.reject(err);
		throw err;
	}
}

export function backupSetting(path: string): string {
	return backupSettingsFile(fileFor(path));
}

export function deleteSetting(path: string): void {
	try {
		unlinkSync(fileFor(path));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

function fileFor(path: string): string {
	const name = path.split(/[\\/]/).pop() ?? path;
	if (name !== path || !/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`Invalid settings path: "${path}"`);

	return `${app.getPath("userData")}/${name}`;
}

function writeJson(file: string, value: unknown): void {
	writeSettingsFile(file, value);
}
