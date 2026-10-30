import type { EndpointDescriptor } from "haritorax-interpreter";

export interface ReconnectTarget {
	connection: "ble" | "serial";
	identity: string;
}

interface TargetState {
	target: ReconnectTarget;
	attempts: number;
	due: number;
	endpointId?: string;
}

interface ReconnectOptions {
	discover: () => Promise<EndpointDescriptor[]>;
	connect: (endpoint: EndpointDescriptor, current: () => boolean) => Promise<void>;
	isConnected: (endpointId: string) => boolean;
	isTargetConnected?: (target: ReconnectTarget) => boolean;
	onError: (target: ReconnectTarget, err: unknown) => void;
	baseDelayMs?: number;
	maxDelayMs?: number;
}

export function endpointIdentity(endpoint: EndpointDescriptor): string {
	if (endpoint.connection === "serial") return endpoint.id;
	return endpoint.displayName.slice(endpoint.displayName.indexOf("-") + 1).trim();
}

function key(target: ReconnectTarget): string {
	return `${target.connection}:${target.identity}`;
}

export function createReconnectController(options: ReconnectOptions) {
	const targets = new Map<string, TargetState>();
	const suppressed = new Set<string>();
	const baseDelay = options.baseDelayMs ?? 2_000;
	const maxDelay = options.maxDelayMs ?? 30_000;

	let active = false;
	let epoch = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pending = false;

	function waiting(id: string, state: TargetState): boolean {
		return (
			!suppressed.has(id) &&
			!options.isTargetConnected?.(state.target) &&
			(!state.endpointId || !options.isConnected(state.endpointId))
		);
	}

	function schedule() {
		if (timer) clearTimeout(timer);
		timer = undefined;

		if (!active || pending) return;

		const pendingTargets = [...targets.entries()].filter(([id, state]) => waiting(id, state));
		if (!pendingTargets.length) return;

		const delay = Math.max(0, Math.min(...pendingTargets.map(([, state]) => state.due)) - Date.now());
		timer = setTimeout(() => {
			timer = undefined;
			void retry();
		}, delay);

		timer.unref();
	}

	function fail(state: TargetState, err: unknown) {
		state.attempts++;
		state.due = Date.now() + Math.min(maxDelay, baseDelay * 2 ** Math.min(state.attempts - 1, 10));
		options.onError(state.target, err);
	}

	async function retry() {
		if (!active || pending) return;

		pending = true;
		const currentEpoch = epoch;
		const current = (id: string, state: TargetState) =>
			active && epoch === currentEpoch && targets.get(id) === state && !suppressed.has(id);

		try {
			const due = [...targets.entries()].filter(([id, state]) => waiting(id, state) && state.due <= Date.now());
			if (!due.length) return;

			let endpoints: EndpointDescriptor[];
			try {
				endpoints = await options.discover();
			} catch (err) {
				for (const [id, state] of due) if (current(id, state)) fail(state, err);
				return;
			}

			for (const [id, state] of due) {
				if (!current(id, state) || !waiting(id, state)) continue;

				const endpoint =
					endpoints.find(
						(item) => item.connection === state.target.connection && item.id === state.endpointId,
					) ??
					endpoints.find(
						(item) =>
							item.connection === state.target.connection &&
							endpointIdentity(item) === state.target.identity,
					);

				if (!endpoint) {
					fail(state, new Error("Device not found"));
					continue;
				}
				state.endpointId = endpoint.id;
				if (!waiting(id, state)) continue;

				try {
					await options.connect(endpoint, () => current(id, state) && waiting(id, state));
					if (current(id, state)) {
						if (options.isConnected(endpoint.id) || options.isTargetConnected?.(state.target)) {
							state.attempts = 0;
							state.due = Date.now() + baseDelay;
						} else fail(state, new Error("Device disconnected during connection"));
					}
				} catch (err) {
					if (current(id, state)) fail(state, err);
				}
			}
		} finally {
			pending = false;
			schedule();
		}
	}

	function add(target: ReconnectTarget, endpointId?: string) {
		const id = key(target);
		const existing = targets.get(id);

		if (existing) {
			if (endpointId) existing.endpointId = endpointId;
			return;
		}

		targets.set(id, { target, attempts: 0, due: Date.now() + baseDelay, endpointId });
	}

	function updateBle(serials: string[]) {
		const keep = new Set(serials.map((identity) => key({ connection: "ble", identity })));

		for (const [id, state] of targets)
			if (state.target.connection === "ble" && !keep.has(id)) {
				targets.delete(id);
				suppressed.delete(id);
			}

		for (const identity of serials) add({ connection: "ble", identity });

		schedule();
	}

	function bind(endpoint: EndpointDescriptor) {
		const state = targets.get(key({ connection: endpoint.connection, identity: endpointIdentity(endpoint) }));
		if (state) state.endpointId = endpoint.id;
	}

	function bindTarget(target: ReconnectTarget, endpointId: string) {
		const state = targets.get(key(target));
		if (state) state.endpointId = endpointId;
	}

	function connected(endpointId: string) {
		for (const state of targets.values()) if (state.endpointId === endpointId) state.attempts = 0;
		schedule();
	}

	function disconnected(endpointId: string) {
		for (const state of targets.values()) if (state.endpointId === endpointId) state.due = Date.now() + baseDelay;
		schedule();
	}

	function suppress(endpointId: string) {
		for (const [id, state] of targets) if (state.endpointId === endpointId) suppressed.add(id);
		schedule();
	}

	function suppressBle(serial: string): string | undefined {
		const id = key({ connection: "ble", identity: serial });
		suppressed.add(id);
		schedule();
		return targets.get(id)?.endpointId;
	}

	function resume(endpoint: EndpointDescriptor) {
		bind(endpoint);

		for (const [id, state] of targets) {
			if (state.endpointId !== endpoint.id) continue;
			suppressed.delete(id);
			state.due = Date.now() + baseDelay;
		}

		schedule();
	}

	function start(initial: ReconnectTarget[], endpoints: EndpointDescriptor[]) {
		stop();
		active = true;

		for (const target of initial) add(target);
		for (const endpoint of endpoints) bind(endpoint);

		schedule();
	}

	function stop() {
		active = false;
		epoch++;
		if (timer) clearTimeout(timer);
		timer = undefined;
		targets.clear();
		suppressed.clear();
	}

	return {
		start,
		stop,
		updateBle,
		bind,
		bindTarget,
		connected,
		disconnected,
		suppress,
		suppressBle,
		resume,
		refresh: schedule,
	};
}
