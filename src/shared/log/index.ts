export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogCategory = string | string[];

export interface LogRecord {
	timestamp: number; // epoch ms
	level: LogLevel;
	categories: string[];
	message: string;
}

export function toCategories(category: LogCategory): string[] {
	return Array.isArray(category) ? category : [category];
}

export function formatCategories(categories: string[]): string {
	return categories.map((c) => `[${c}]`).join("");
}

export function formatArg(arg: unknown): string {
	if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
	if (typeof arg === "string") return arg;
	if (arg === undefined) return "undefined";
	try {
		return typeof arg === "object" ? JSON.stringify(arg) : String(arg);
	} catch {
		return String(arg);
	}
}

export function formatMessage(args: unknown[]): string {
	return args.map(formatArg).join(" ");
}

export function formatRecord(record: LogRecord): string {
	const time = new Date(record.timestamp).toISOString();
	return `${time} ${record.level.toUpperCase().padEnd(5)} ${formatCategories(record.categories)} ${record.message}`;
}

export function isLogRecord(value: unknown): value is LogRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Partial<LogRecord>;
	return (
		typeof record.timestamp === "number" &&
		LOG_LEVELS.includes(record.level as LogLevel) &&
		Array.isArray(record.categories) &&
		record.categories.every((c) => typeof c === "string") &&
		typeof record.message === "string"
	);
}
