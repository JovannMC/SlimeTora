import { app } from "electron";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

export function getSetting<T = unknown>(path: string): T | undefined {
	return readJson(fileFor(path)) as T | undefined;
}

export function setSetting(path: string, value: unknown): void {
	writeJson(fileFor(path), value);
}

export function deleteSetting(path: string): void {
	try {
		unlinkSync(fileFor(path));
	} catch {
		// already gone
	}
}

function fileFor(path: string): string {
	const name = path.split(/[\\/]/).pop() ?? path;
	if (name !== path || !/^[A-Za-z0-9._-]+$/.test(name)) throw new Error(`Invalid settings path: "${path}"`);

	return `${app.getPath("userData")}/${name}`;
}

function readJson(file: string): Record<string, unknown> | undefined {
	try {
		return JSON.parse(readFileSync(file, "utf-8")) ?? {};
	} catch {
		return undefined;
	}
}

function writeJson(file: string, value: unknown): void {
	mkdirSync(app.getPath("userData"), { recursive: true });
	writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
}
