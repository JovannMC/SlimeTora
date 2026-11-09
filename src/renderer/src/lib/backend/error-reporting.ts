import type { SerializedBackendError } from "$shared/backend/contract";

type ErrorToastKey = "serial_port" | "bluetooth" | "decode_failed" | "failed";
type ToastParams = Record<string, string>;

export interface BackendErrorToast {
	key: ErrorToastKey;
	params: ToastParams;
	persistent: boolean;
}

export function serializeBackendError(value: unknown, depth = 0): SerializedBackendError {
	if (depth >= 4) return { message: "Additional nested error details omitted" };
	if (!(value instanceof Error)) return { message: String(value) };

	const result: SerializedBackendError = { message: value.message, name: value.name };
	const code = (value as Error & { code?: unknown }).code;
	if (typeof code === "string") result.code = code;

	const context = (value as Error & { context?: Record<string, unknown> }).context;
	if (context) {
		result.context = Object.fromEntries(
			Object.entries(context).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
		);
	}

	if (value.cause !== undefined) result.cause = serializeBackendError(value.cause, depth + 1);
	if (value instanceof AggregateError) {
		result.causes = [...value.errors].slice(0, 8).map((cause) => serializeBackendError(cause, depth + 1));
	}

	return result;
}

export function classifyBackendError(value: SerializedBackendError): BackendErrorToast {
	const errors: SerializedBackendError[] = [];
	const visit = (item: unknown, depth = 0) => {
		if (depth > 5 || !item || typeof item !== "object") return;
		const current = item as SerializedBackendError;
		errors.push(current);
		visit(current.cause, depth + 1);
		for (const child of current.causes ?? []) visit(child, depth + 1);
	};
	visit(value);

	const code = errors.map((item) => item.code).find(Boolean);
	const nativeCode = errors
		.map((item) => item.code)
		.find((item) => item && /^(?:E[A-Z0-9]+|UNKNOWN|ACCESS_DENIED)$/.test(item));
	const context = value.context ?? {};
	const isSerial = context.connection === "serial";
	const isBle = context.connection === "ble" || context.connection === "bluetooth-le";
	const isPermission = errors.some((item) => /^(EPERM|EACCES)$/.test(item.code ?? ""));
	const isPortFailure = errors.some((item) => /^(ENOENT|ENODEV|EBADF|EIO|EPIPE|EBUSY)$/.test(item.code ?? ""));
	const isTransportFailure =
		code === "LINK_UNAVAILABLE" ||
		code === "CONNECTION_FAILED" ||
		code === "WRITE_FAILED" ||
		code === "READ_FAILED" ||
		isPermission;

	if (
		isSerial &&
		(isPermission ||
			isPortFailure ||
			code === "WRITE_FAILED" ||
			code === "READ_FAILED" ||
			code === "CONNECTION_FAILED")
	) {
		return {
			key: "serial_port",
			params: {
				tracker: context.trackerId ? ` (${context.trackerId})` : "",
				error: `${nativeCode ?? code ?? value.message}${context.operation ? ` for ${context.operation}` : ""}`,
			},
			persistent: true,
		};
	}
	if (isBle && (isPermission || isTransportFailure || context.adapterState)) {
		return {
			key: "bluetooth",
			params: {
				tracker: context.trackerId ? ` (${context.trackerId})` : "",
				state: context.adapterState ? `, adapter state: ${context.adapterState}` : "",
				error: `${nativeCode ?? code ?? value.message}${context.operation ? ` for ${context.operation}` : ""}`,
			},
			persistent: true,
		};
	}
	if (code === "DECODE_FAILED") {
		return {
			key: "decode_failed",
			params: {
				tracker: context.trackerId ? ` (${context.trackerId})` : "",
				error: value.message,
			},
			persistent: false,
		};
	}
	return {
		key: "failed",
		params: {
			operation: context.operation ? ` (${context.operation})` : "",
			error: value.message,
		},
		persistent: isTransportFailure || Boolean(context.adapterState),
	};
}
