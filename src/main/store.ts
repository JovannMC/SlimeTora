import { app } from "electron";
import { unlinkSync } from "node:fs";
import { backupSettingsFile, readSettingsFile, writeSettingsFile } from "./settings-file";

export function getSetting<T = unknown>(path: string, options: { backupCorrupt?: boolean } = {}): T | undefined {
	return readSettingsFile(fileFor(path), options);
}

export function setSetting(path: string, value: unknown): void {
	writeJson(fileFor(path), value);
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
