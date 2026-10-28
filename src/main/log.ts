import {
	formatMessage,
	formatRecord,
	toCategories,
	type LogCategory,
	type LogLevel,
	type LogRecord,
} from "$shared/log/index";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_LOG_FILES = 10;
const LOG_FILE_PREFIX = "slimetora-";

let stream: fs.WriteStream | undefined;

export function logsDirectory(): string {
	return path.join(app.getPath("userData"), "logs");
}

function openLogFile(): fs.WriteStream {
	if (stream) return stream;

	const dir = logsDirectory();
	fs.mkdirSync(dir, { recursive: true });

	const existing = fs
		.readdirSync(dir)
		.filter((file) => file.startsWith(LOG_FILE_PREFIX) && file.endsWith(".log"))
		.sort();
	for (const old of existing.slice(0, Math.max(0, existing.length - MAX_LOG_FILES + 1))) {
		fs.rmSync(path.join(dir, old), { force: true });
	}

	const name = `${LOG_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}.log`;
	stream = fs.createWriteStream(path.join(dir, name), { flags: "a" });
	stream.on("error", (err) => console.error(`[log] Failed to write log file: ${err}`));
	return stream;
}

export function writeRecord(record: LogRecord): void {
	const line = formatRecord(record);
	const echo = record.level === "error" ? console.error : record.level === "warn" ? console.warn : console.log;
	echo(line);

	try {
		openLogFile().write(`${line}\n`);
	} catch (err) {
		console.error(`[log] Failed to write log file: ${err}`);
	}
}

function emit(level: LogLevel, category: LogCategory, args: unknown[]): void {
	writeRecord({
		timestamp: Date.now(),
		level,
		categories: toCategories(category),
		message: formatMessage(args),
	});
}

export const trace = (category: LogCategory, ...args: unknown[]) => emit("trace", category, args);
export const debug = (category: LogCategory, ...args: unknown[]) => emit("debug", category, args);
export const info = (category: LogCategory, ...args: unknown[]) => emit("info", category, args);
export const warn = (category: LogCategory, ...args: unknown[]) => emit("warn", category, args);
export const error = (category: LogCategory, ...args: unknown[]) => emit("error", category, args);

export function closeLogFile(): void {
	stream?.end();
	stream = undefined;
}
