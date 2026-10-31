import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readSettingsFile<T = unknown>(file: string, options: { backupCorrupt?: boolean } = {}): T | undefined {
	let contents: string;

	try {
		contents = readFileSync(file, "utf-8");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw err;
	}

	try {
		const value: unknown = JSON.parse(contents);
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a JSON object");
		return value as T;
	} catch (err) {
		if (!options.backupCorrupt)
			throw new Error(`Could not read settings file ${file}: ${String(err)}`, { cause: err });

		const backup = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;

		try {
			renameSync(file, backup);
		} catch (backupError) {
			throw new Error(
				`Could not read settings file ${file} (${String(err)}); also failed to preserve it: ${String(backupError)}`,
				{ cause: backupError },
			);
		}

		throw new Error(`Settings file was invalid and has been preserved as ${backup}: ${String(err)}`, {
			cause: err,
		});
	}
}

export function writeSettingsFile(file: string, value: unknown): void {
	const directory = dirname(file);
	mkdirSync(directory, { recursive: true });

	const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
	try {
		const serialized = JSON.stringify(value, null, 2);
		if (serialized === undefined) throw new Error("Settings value cannot be serialized as JSON");

		writeFileSync(temporary, serialized, { encoding: "utf-8", flag: "wx" });
		renameSync(temporary, file);
	} catch (err) {
		try {
			unlinkSync(temporary);
		} catch {
			// no temporary file was created
		}
		throw err;
	}
}
