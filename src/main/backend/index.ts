import type {
	BackendCalls,
	BackendEventName,
	BackendEvents,
	BackendSnapshot,
	SessionOptions,
	SessionState,
} from "$shared/backend/contract";
import { BACKEND_EVENTS } from "$shared/backend/contract";
import { Channels } from "$shared/ipc/channels";
import { BrowserWindow, ipcMain } from "electron";
import type { Connection, DeviceSnapshot, EndpointDescriptor, HaritoraX, LogEntry } from "haritorax-interpreter";
import { debug, error, info, trace, warn } from "../log";
import { getSetting } from "../store";
import { createDiscoveryController } from "./discovery";
import { createReconnectController, endpointIdentity } from "./reconnect";
import { SlimeVRBridge } from "./slimevr";

let backend: HaritoraX | undefined;
let backendStarting: Promise<HaritoraX> | undefined;
const discovery = createDiscoveryController(getBackend);
let bleConnection: Promise<Connection> | undefined;
let previewScan:
	{ abort: AbortController; result: Promise<import("haritorax-interpreter").EndpointDescriptor[]> } | undefined;
let enabled = false;
let generation = 0;
let pendingStops = 0;
let transition: Promise<void> = Promise.resolve();
let sessionState: SessionState = { status: "off", requestedEnabled: false, revision: 0 };
let snapshotRevision = 0;
let previewEndpoints: EndpointDescriptor[] = [];
const operations = new Set<Promise<unknown>>();
const openEndpoints = new Set<string>();
const liveTrackers = new Map<string, string>();
const dongleSlots = new Map<string, Record<string, "paired" | "unpaired">>();
const bridgeTasks = new Set<Promise<unknown>>();
const connecting = new Map<string, Promise<void>>();
let activeOptions: SessionOptions | undefined;
const slimevr = new SlimeVRBridge();

const reconnect = createReconnectController({
	discover: () => backendCalls.discover(),
	connect: (endpoint, current) =>
		runEnabled(async (check) => {
			if (endpoint.connection === "serial" && endpoint.model && !activeOptions?.models.includes(endpoint.model)) {
				throw new Error("Device model is disabled in connection settings");
			}
			const instance = await getBackend();
			check();
			if (!current()) return;
			await connectEndpoint(instance, endpoint.id);
		}),
	isConnected: (endpointId) => openEndpoints.has(endpointId),
	isTargetConnected: (target) =>
		target.connection === "ble" && isDeviceStreaming(backend?.getDevice(target.identity)),
	onError: (target, err) => warn(["backend", "reconnect"], `Could not connect to ${target.identity}: ${String(err)}`),
});

function connectEndpoint(instance: HaritoraX, endpointId: string): Promise<void> {
	if (openEndpoints.has(endpointId)) return Promise.resolve();
	const endpoint = instance.getEndpoints().find((item) => item.id === endpointId);
	if (endpoint?.connection === "ble" && isDeviceStreaming(instance.getDevice(endpointIdentity(endpoint))))
		return Promise.resolve();
	const existing = connecting.get(endpointId);
	if (existing) return existing;
	const attempt = instance.connect(endpointId).finally(() => {
		if (connecting.get(endpointId) === attempt) connecting.delete(endpointId);
	});
	connecting.set(endpointId, attempt);
	return attempt;
}

function isDeviceStreaming(device: DeviceSnapshot | undefined): boolean {
	return Boolean(
		device &&
		openEndpoints.has(device.endpointId) &&
		device.trackers.some(
			(tracker) => tracker.connected && liveTrackers.get(tracker.trackerId) === device.endpointId,
		),
	);
}

function bindReconnectTargets(): void {
	for (const endpoint of backend?.getEndpoints() ?? []) reconnect.bind(endpoint);
	for (const device of backend?.getDevices() ?? [])
		if (device.connection === "ble")
			reconnect.bindTarget({ connection: "ble", identity: device.deviceId }, device.endpointId);
	reconnect.refresh();
}

async function disconnectEndpoint(instance: HaritoraX, endpointId: string, check: () => void): Promise<void> {
	await connecting.get(endpointId)?.catch(() => undefined);
	check();
	await instance.disconnect(endpointId);
}

function track<T>(tasks: Set<Promise<unknown>>, task: Promise<T>): Promise<T> {
	tasks.add(task);
	void task.then(
		() => tasks.delete(task),
		() => tasks.delete(task),
	);
	return task;
}

function requireEnabled(): void {
	if (!enabled) throw new Error("Enable tracking before communicating with devices");
}

function runEnabled<T>(action: (check: () => void) => Promise<T>): Promise<T> {
	requireEnabled();
	const current = generation;
	const check = () => {
		if (!enabled || generation !== current) throw new Error("Tracking session changed");
	};
	const ready = transition;
	return track(
		operations,
		ready.then(() => {
			check();
			return action(check);
		}),
	);
}

function withBackend<T>(action: (instance: HaritoraX) => Promise<T>): Promise<T> {
	return runEnabled(async (check) => {
		const instance = await getBackend();
		check();
		return action(instance);
	});
}

function getBleConnection(): Promise<Connection> {
	return (bleConnection ??= import("haritorax-interpreter/connections/ble")
		.then(({ createBleConnection }) => createBleConnection({ rssiPollMs: 2_000 }))
		.catch((err) => {
			bleConnection = undefined;
			throw err;
		}));
}

async function stopBlePreview(): Promise<void> {
	const scan = previewScan;
	if (!scan) return;
	scan.abort.abort();
	await scan.result.catch(() => undefined);
}

function scanBlePreview(): Promise<import("haritorax-interpreter").EndpointDescriptor[]> {
	if (previewScan) return previewScan.result;
	const abort = new AbortController();
	const result = (async () => {
		await discovery.stopDiscovery();
		if (abort.signal.aborted) return [];
		const connection = await getBleConnection();
		if (abort.signal.aborted) return [];
		const endpoints = await connection.list({ timeoutMs: 5_000, signal: abort.signal });
		if (!abort.signal.aborted) {
			previewEndpoints = endpoints;
			publishSnapshot();
		}
		return endpoints;
	})().finally(() => {
		if (previewScan?.abort === abort) previewScan = undefined;
	});
	previewScan = { abort, result };
	return result;
}

async function loadConnections(): Promise<Connection[]> {
	const connections: Connection[] = [];

	try {
		const { createSerialConnection } = await import("haritorax-interpreter/connections/serial");
		connections.push(createSerialConnection({ includeWired: true }));
	} catch (err) {
		error(["backend", "serial"], "Serial connection unavailable:", err);
	}

	try {
		connections.push(await getBleConnection());
	} catch (err) {
		error(["backend", "ble"], "BLE connection unavailable:", err);
	}

	return connections;
}

const LOG_FUNCTIONS = { trace, debug, info, warn, error } as const;

function send<E extends BackendEventName>(event: E, payload: BackendEvents[E]): void {
	for (const window of BrowserWindow.getAllWindows()) {
		window.webContents.send(Channels.backendEvent, { event, payload });
	}
}

function publishSession(status: SessionState["status"], failure?: unknown): void {
	sessionState = {
		status,
		requestedEnabled: enabled,
		revision: sessionState.revision + 1,
		...(failure === undefined ? {} : { error: failure instanceof Error ? failure.message : String(failure) }),
	};
	send("session", sessionState);
}

function getSnapshot(): BackendSnapshot {
	return {
		revision: snapshotRevision,
		endpoints: backend?.getEndpoints() ?? [],
		previewEndpoints,
		connectedEndpointIds: [...openEndpoints],
		devices: (backend?.getDevices() ?? []).map((device) => ({
			...device,
			trackers: device.trackers.map((tracker) => ({
				...tracker,
				connected:
					tracker.connected &&
					openEndpoints.has(device.endpointId) &&
					liveTrackers.get(tracker.trackerId) === device.endpointId,
			})),
		})),
		dongleSlots: Object.fromEntries(dongleSlots),
		dongleChannels: Object.fromEntries(
			[...openEndpoints].flatMap((id) => {
				const channel = backend?.getChannel(id);
				return channel === undefined ? [] : [[id, channel]];
			}),
		),
	};
}

function publishSnapshot(): void {
	snapshotRevision++;
	send("snapshot", getSnapshot());
}

function getBackend(): Promise<HaritoraX> {
	if (backend) return Promise.resolve(backend);
	backendStarting ??= createBackend().finally(() => {
		backendStarting = undefined;
	});
	return backendStarting;
}

async function createBackend(): Promise<HaritoraX> {
	const instanceGeneration = generation;
	const { createHaritoraX } = await import("haritorax-interpreter");
	const connections = await loadConnections();

	backend = createHaritoraX({
		connections,
		logLevel: "info",
		onLog: (entry: LogEntry) => {
			const args = entry.data ? [entry.message, entry.data] : [entry.message];
			LOG_FUNCTIONS[entry.level](["haritorax"], ...args);
		},
	});
	for (const event of BACKEND_EVENTS) {
		if (event === "error" || event === "imu") continue;
		backend.on(event, (payload) => send(event, payload));
	}
	backend.on("error", ({ error: err }) => send("error", { error: { message: err.message } }));
	backend.on("endpoint:connected", ({ endpointId }) => {
		openEndpoints.add(endpointId);
		const endpoint = backend?.getEndpoints().find((item) => item.id === endpointId);
		if (endpoint) reconnect.bind(endpoint);
		reconnect.connected(endpointId);
		publishSnapshot();
	});
	backend.on("endpoint:disconnected", ({ endpointId, reason }) => {
		openEndpoints.delete(endpointId);
		for (const [trackerId, endpoint] of liveTrackers) if (endpoint === endpointId) liveTrackers.delete(trackerId);
		dongleSlots.delete(endpointId);
		if (reason !== "requested") reconnect.disconnected(endpointId);
		publishSnapshot();
	});
	backend.on("devices", () => {
		bindReconnectTargets();
		publishSnapshot();
	});
	backend.on("tracker:disconnected", ({ trackerId, deviceId, reason }) => {
		liveTrackers.delete(trackerId);
		reconnect.refresh();
		if (reason !== "timeout" || !enabled || generation !== instanceGeneration) return;
		const device = backend?.getDevice(deviceId);
		if (!device || device.connection !== "ble" || device.trackers.some((tracker) => tracker.connected)) return;
		if (!openEndpoints.has(device.endpointId)) return;
		void runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			const latest = instance.getDevice(deviceId);
			if (!latest || latest.trackers.some((tracker) => tracker.connected)) return;
			await instance.disconnect(device.endpointId);
			check();
			reconnect.disconnected(device.endpointId);
		}).catch((err) => {
			if (enabled && generation === instanceGeneration)
				warn(["backend", "reconnect"], `Could not reset stalled BLE device ${deviceId}: ${String(err)}`);
		});
	});
	backend.on("channel", () => publishSnapshot());
	for (const event of ["paired", "unpaired"] as const) {
		backend.on(event, ({ endpointId, slot }) => {
			dongleSlots.set(endpointId, { ...dongleSlots.get(endpointId), [slot]: event });
			publishSnapshot();
		});
	}

	backend.on("device:connected", (event) => {
		const device = backend?.getDevice(event.deviceId);
		if (device && enabled && generation === instanceGeneration) {
			void track(bridgeTasks, slimevr.deviceConnected(device)).catch((err) =>
				error(["backend", "slimevr"], "Failed to initialize device:", err),
			);
		}
	});
	backend.on("device:disconnected", ({ deviceId }) => void slimevr.deviceDisconnected(deviceId));
	backend.on("imu", (sample) => {
		if (!enabled || generation !== instanceGeneration) return;

		const device = backend?.getDevice(sample.deviceId);
		if (!device) return;

		if (liveTrackers.get(sample.trackerId) !== device.endpointId) {
			liveTrackers.set(sample.trackerId, device.endpointId);
			reconnect.refresh();
			publishSnapshot();
		}

		slimevr.imu(sample);
		send("imu", sample);
	});
	backend.on("battery", (battery) => {
		if (enabled && generation === instanceGeneration) slimevr.battery(battery);
	});

	info(["backend"], "Backend started");
	return backend;
}

function startSession(options: SessionOptions): Promise<void> {
	if (enabled) return transition;
	enabled = true;
	const current = ++generation;
	const isCurrent = () => enabled && generation === current;
	publishSession("starting");
	const next = transition
		.then(async () => {
			if (!isCurrent()) return;
			activeOptions = options;
			slimevr.configure({ slimevrIp: options.slimevr.ip, slimevrPort: options.slimevr.port });
			await stopBlePreview();
			if (!isCurrent()) return;
			const endpoints = await discovery.discover();
			if (!isCurrent()) return;
			previewEndpoints = [];
			publishSnapshot();
			for (const endpoint of endpoints) {
				if (!isCurrent()) break;
				if (!options.modes.includes(endpoint.connection)) continue;
				if (endpoint.connection === "ble") {
					if (!options.bleSerials.includes(endpointIdentity(endpoint))) continue;
				} else {
					if (!options.ports.includes(endpoint.id)) continue;
					if (endpoint.model && !options.models.includes(endpoint.model)) continue;
				}
				try {
					const instance = await getBackend();
					if (!isCurrent()) break;
					await connectEndpoint(instance, endpoint.id);
				} catch (err) {
					error(["backend"], `Failed to connect to ${endpoint.displayName}:`, err);
				}
			}
			if (isCurrent()) {
				reconnect.start(
					[
						...(options.modes.includes("ble")
							? options.bleSerials.map((identity) => ({ connection: "ble" as const, identity }))
							: []),
						...(options.modes.includes("serial")
							? options.ports.map((identity) => ({ connection: "serial" as const, identity }))
							: []),
					],
					endpoints,
				);
				bindReconnectTargets();
				publishSession("on");
			}
		})
		.catch((err) => {
			if (isCurrent()) publishSession("error", err);
			throw err;
		});
	transition = next;
	return next;
}

function stopSession(turnOffTrackers = false): Promise<void> {
	enabled = false;
	reconnect.stop();
	const current = ++generation;
	publishSession("stopping");
	pendingStops++;
	const pendingOperations = [...operations];
	const cancelDiscovery = discovery.stopDiscovery().catch((err) => {
		error(["backend"], "Failed to stop discovery:", err);
	});
	const next = transition
		.catch(() => undefined)
		.then(async () => {
			await stopBlePreview();
			await cancelDiscovery;
			await Promise.allSettled(pendingOperations);
			await Promise.allSettled([...bridgeTasks]);
			if (turnOffTrackers && backend) {
				for (const device of backend.getDevices()) {
					if (device.model === "wired" || !openEndpoints.has(device.endpointId)) continue;
					try {
						await backend.powerOff(device.deviceId);
					} catch (err) {
						warn(["backend"], `Failed to power off ${device.deviceId} on exit: ${String(err)}`);
					}
				}
			}

			for (const endpoint of [...openEndpoints]) {
				try {
					await backend?.disconnect(endpoint);
				} catch (err) {
					error(["backend"], `Failed to disconnect ${endpoint}:`, err);
				}
			}

			await slimevr.dispose();

			if (backend) await backend.dispose();
			else if (bleConnection) await (await bleConnection).dispose();

			backend = undefined;
			bleConnection = undefined;
			activeOptions = undefined;

			openEndpoints.clear();
			liveTrackers.clear();
			dongleSlots.clear();

			publishSnapshot();

			if (generation === current) publishSession("off");
		})
		.catch((err) => {
			if (generation === current) publishSession("error", err);
			throw err;
		})
		.finally(() => {
			pendingStops--;
		});
	transition = next;
	return next;
}

export const backendCalls: BackendCalls = {
	startSession,
	stopSession: () => stopSession(),
	getSessionState: () => sessionState,
	getSnapshot,
	updateBleTargets: (serials) => {
		if (!enabled || !activeOptions?.modes.includes("ble")) return;
		reconnect.updateBle(serials);
		bindReconnectTargets();
	},
	forgetBleTarget: (serial) => {
		requireEnabled();
		const bound = reconnect.suppressBle(serial);
		return runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			const endpointId =
				bound ??
				instance.getEndpoints().find((item) => item.connection === "ble" && endpointIdentity(item) === serial)
					?.id;
			if (!endpointId) return;
			await disconnectEndpoint(instance, endpointId, check);
		});
	},
	listSerialPorts: async () => {
		const { autoDetect } = await import("@serialport/bindings-cpp");
		return (await autoDetect().list()).map((port: { path: string }) => port.path).sort();
	},
	scanBlePreview: () => {
		if (enabled || pendingStops) throw new Error("BLE preview is only available while tracking is off");
		return scanBlePreview();
	},
	stopBlePreview,
	discover: () =>
		runEnabled(async (check) => {
			await stopBlePreview();
			check();
			const endpoints = await discovery.discover();
			check();
			previewEndpoints = [];
			publishSnapshot();
			return endpoints;
		}),
	stopDiscovery: discovery.stopDiscovery,
	connect: (endpointId) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			const endpoint = instance.getEndpoints().find((item) => item.id === endpointId);
			if (endpoint) reconnect.resume(endpoint);
			await connectEndpoint(instance, endpointId);
		}),
	disconnect: (endpointId) => {
		requireEnabled();
		reconnect.suppress(endpointId);
		return runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await disconnectEndpoint(instance, endpointId, check);
		});
	},
	setSettings: (deviceId, settings) => withBackend((instance) => instance.setSettings(deviceId, settings)),
	setBodyPart: (deviceId, bodyPart) => withBackend((instance) => instance.setBodyPart(deviceId, bodyPart)),
	powerOff: (deviceId) => withBackend((instance) => instance.powerOff(deviceId)),
	switchCommunication: (deviceId, mode) => withBackend((instance) => instance.switchCommunication(deviceId, mode)),
	setChannel: (endpointId, channel) => withBackend((instance) => instance.setChannel(endpointId, channel)),
	pair: (endpointId, slot) => withBackend((instance) => instance.pair(endpointId, slot)),
	unpair: (endpointId, slot) => withBackend((instance) => instance.unpair(endpointId, slot)),
	sendUserAction: (deviceId, action) => {
		requireEnabled();
		slimevr.sendUserAction(deviceId, action);
	},
};

export function registerBackendIpc(): void {
	ipcMain.handle(Channels.backendInvoke, (_event, command: unknown, args: unknown) => {
		if (typeof command !== "string" || !Object.hasOwn(backendCalls, command)) {
			throw new Error(`Unknown backend command: ${String(command)}`);
		}

		const call = backendCalls[command as keyof BackendCalls] as (...params: unknown[]) => unknown;
		return call(...(Array.isArray(args) ? args : []));
	});
}

export async function disposeBackend(): Promise<void> {
	const saved = getSetting<{ settings?: { program?: { autoOff?: boolean } } }>("settings.json");
	await stopSession(saved?.settings?.program?.autoOff === true);
}
