import { getBridge, isBridgeAvailable } from "#lib/api/bridge";
import { formatCategories, formatMessage, toCategories, type LogCategory, type LogLevel } from "$shared/log/index";

type LoggingMode = "minimal" | "debug" | "all";

const logWeight: Record<LogLevel, number> = { trace: 0, debug: 1, info: 2, warn: 3, error: 4 };
const minimumLogWeight: Record<LoggingMode, number> = { all: 0, debug: 1, minimal: 2 };
let loggingMode: LoggingMode = "minimal";

export function setLoggingMode(mode: LoggingMode): void {
	loggingMode = mode;
}

const consoleMethod = {
	trace: "debug",
	debug: "debug",
	info: "info",
	warn: "warn",
	error: "error",
} as const satisfies Record<LogLevel, "debug" | "info" | "warn" | "error">;

function emit(level: LogLevel, category: LogCategory, args: unknown[]) {
	const categories = toCategories(category);
	const minimumLevel = minimumLogWeight[loggingMode];
	if (logWeight[level] >= minimumLevel) console[consoleMethod[level]](formatCategories(categories), ...args);

	if (isBridgeAvailable()) {
		getBridge().log({ timestamp: Date.now(), level, categories, message: formatMessage(args) });
	}
}

export const trace = (category: LogCategory, ...args: unknown[]) => emit("trace", category, args);
export const debug = (category: LogCategory, ...args: unknown[]) => emit("debug", category, args);
export const info = (category: LogCategory, ...args: unknown[]) => emit("info", category, args);
export const warn = (category: LogCategory, ...args: unknown[]) => emit("warn", category, args);
export const error = (category: LogCategory, ...args: unknown[]) => emit("error", category, args);

export function captureUncaughtErrors(): () => void {
	const onError = (event: ErrorEvent) => error(["renderer", "uncaught"], event.error ?? event.message);
	const onRejection = (event: PromiseRejectionEvent) => error(["renderer", "promise"], event.reason);

	window.addEventListener("error", onError);
	window.addEventListener("unhandledrejection", onRejection);
	return () => {
		window.removeEventListener("error", onError);
		window.removeEventListener("unhandledrejection", onRejection);
	};
}
