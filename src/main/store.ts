import { app } from "electron";
import { mkdirSync } from "node:fs";
import { readFileSync, writeFileSync } from "node:fs";

function getPaths() {
	const dataDir = app.getPath("userData");
	return {
		dataDir,
		STORE_PATH: `${dataDir}/settings.json`,
	};
}

export function getSetting<T = unknown>(key: string): T | undefined {
	const data = load();
	return data[key] as T | undefined;
}

export function setSetting(key: string, value: unknown): void {
	const data = load();
	data[key] = value;
	save(data);
}

export function deleteSetting(key: string): void {
	const data = load();
	delete data[key];
	save(data);
}

function load(): Record<string, unknown> {
	const { STORE_PATH } = getPaths();
	try {
		return JSON.parse(readFileSync(STORE_PATH, "utf-8")) ?? {};
	} catch {
		return {};
	}
}

function save(data: Record<string, unknown>): void {
	const { dataDir, STORE_PATH } = getPaths();
	mkdirSync(dataDir, { recursive: true });
	writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), "utf-8");
}
