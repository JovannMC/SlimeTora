import { getBridge, isBridgeAvailable } from "#lib/api/bridge";
import type { BackendCalls, BackendEventMessage, BackendEventName, BackendEvents } from "$shared/backend/contract";

type Result<K extends keyof BackendCalls> = Awaited<ReturnType<BackendCalls[K]>>;

export async function invoke<K extends keyof BackendCalls>(
	command: K,
	...args: Parameters<BackendCalls[K]>
): Promise<Result<K>> {
	if (!isBridgeAvailable()) throw new Error(`Backend command "${command}" needs the Electron main process`);
	return (await getBridge().backend.invoke(command, args)) as Result<K>;
}

const listeners = new Set<(message: BackendEventMessage) => void>();
let subscribed = false;

// the preload bridge can only be subscribed to once, so every listener shares one subscription
function subscribe() {
	if (subscribed || !isBridgeAvailable()) return;
	subscribed = true;
	getBridge().backend.subscribe((message) => {
		for (const listener of listeners) listener(message);
	});
}

export function listen<E extends BackendEventName>(event: E, handler: (payload: BackendEvents[E]) => void): () => void {
	const listener = (message: BackendEventMessage) => {
		if (message.event === event) handler(message.payload as BackendEvents[E]);
	};

	listeners.add(listener);
	subscribe();
	return () => {
		listeners.delete(listener);
	};
}
