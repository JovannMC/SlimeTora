import {
	formatMessage,
	formatRecord,
	isLogRecord,
	toCategories,
	type LogCategory,
	type LogLevel,
	type LogRecord,
} from "$shared/log/index";
import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

const MAX_LOG_FILES = 10;
const MAX_PENDING_LOG_BYTES = 1024 * 1024;
const LOG_FILE_PREFIX = "slimetora-";
const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
const MIN_LOG_WEIGHT: Record<LoggingMode, number> = { all: 0, debug: 1, minimal: 2 };

export type LoggingMode = "minimal" | "debug" | "all";

interface LoggingPreferences {
	writeLogs: boolean;
	loggingMode: LoggingMode;
}

let preferences: LoggingPreferences = { writeLogs: true, loggingMode: "minimal" };

let stream: fs.WriteStream | undefined;
let streamBackpressured = false;
let fileLoggingFailed = false;
let pendingLines: string[] = [];
let pendingBytes = 0;
let warnedAboutDroppedLogs = false;
let fileSequence = 0;

const failedConsoleStreams = new Set<NodeJS.WriteStream>();

for (const output of [process.stdout, process.stderr]) {
	output.on("error", () => failedConsoleStreams.add(output));
}

function writeToConsole(level: LogLevel, message: string): void {
	const output = level === "error" || level === "warn" ? process.stderr : process.stdout;
	if (failedConsoleStreams.has(output)) return;

	try {
		output.write(`${message}\n`);
	} catch {
		failedConsoleStreams.add(output);
	}
}

export function logsDirectory(): string {
	return path.join(app.getPath("userData"), "logs");
}

export function configureLogging(value: unknown): void {
	if (typeof value !== "object" || value === null) return;
	const settings = value as Partial<LoggingPreferences>;
	preferences = {
		writeLogs: typeof settings.writeLogs === "boolean" ? settings.writeLogs : true,
		loggingMode:
			settings.loggingMode === "minimal" || settings.loggingMode === "debug" || settings.loggingMode === "all"
				? settings.loggingMode
				: "minimal",
	};
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

	const name = `${LOG_FILE_PREFIX}${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${fileSequence++}.log`;
	const current = fs.createWriteStream(path.join(dir, name), { flags: "a" });
	stream = current;

	current.on("error", (err) => {
		if (stream === current) {
			stream = undefined;
			streamBackpressured = false;
			fileLoggingFailed = true;
			pendingLines = [];
			pendingBytes = 0;
		}
		writeToConsole("error", `[log] Failed to write log file: ${err}`);
	});

	current.on("drain", () => {
		if (stream !== current) return;
		streamBackpressured = false;
		flushPendingLines();
	});

	return current;
}
function writeFileLine(line: string): void {
	if (fileLoggingFailed) return;

	const bytes = Buffer.byteLength(line);
	if (streamBackpressured || pendingLines.length > 0) {
		if (pendingBytes + bytes > MAX_PENDING_LOG_BYTES) {
			if (!warnedAboutDroppedLogs) {
				warnedAboutDroppedLogs = true;
				writeToConsole("warn", "[log] Dropping file log records because the write queue is full");
			}
			return;
		}
		pendingLines.push(line);
		pendingBytes += bytes;
		return;
	}

	writeFileLineNow(line);
}

function writeFileLineNow(line: string): void {
	const current = openLogFile();
	if (!current.write(line)) streamBackpressured = true;
}

function flushPendingLines(): void {
	while (!streamBackpressured && pendingLines.length > 0 && !fileLoggingFailed) {
		const line = pendingLines.shift()!;
		pendingBytes -= Buffer.byteLength(line);
		writeFileLineNow(line);
	}
}

export function writeRecord(record: LogRecord): void {
	try {
		if (!isLogRecord(record)) {
			writeToConsole("error", "[log] Dropped invalid log record");
			return;
		}

		const minimumLevel = MIN_LOG_WEIGHT[preferences.loggingMode];
		if (LOG_LEVEL_WEIGHT[record.level] < minimumLevel) return;

		const line = formatRecord(record);
		writeToConsole(record.level, line);
		if (preferences.writeLogs) writeFileLine(`${line}\n`);
	} catch (err) {
		writeToConsole("error", `[log] Failed to process log record: ${String(err)}`);
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

export async function closeLogFile(): Promise<void> {
	while (pendingLines.length > 0 && !fileLoggingFailed) {
		if (streamBackpressured && stream) {
			const current = stream;
			await new Promise<void>((resolve) => {
				current.once("drain", resolve);
				current.once("error", () => resolve());
			});
		} else {
			flushPendingLines();
		}
	}

	const current = stream;
	stream = undefined;
	if (!current || current.destroyed || current.writableFinished) return;
	await new Promise<void>((resolve) => {
		current.once("finish", resolve);
		current.once("error", () => resolve());
		current.end();
	});
}
