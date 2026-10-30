import type { BackendCalls, BackendEventName, BackendEvents, SessionOptions } from "$shared/backend/contract";
import { BACKEND_EVENTS } from "$shared/backend/contract";
import { Channels } from "$shared/ipc/channels";
import { BrowserWindow, ipcMain } from "electron";
import type { Connection, HaritoraX, LogEntry } from "haritorax-interpreter";
import { debug, error, info, trace, warn } from "../log";
import { createDiscoveryController } from "./discovery";
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
const operations = new Set<Promise<unknown>>();
const openEndpoints = new Set<string>();
const bridgeTasks = new Set<Promise<unknown>>();
export let slimevr = new SlimeVRBridge();

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
		return connection.list({ timeoutMs: 5_000, signal: abort.signal });
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
	if (!slimevr) slimevr = new SlimeVRBridge();

	for (const event of BACKEND_EVENTS) {
		if (event === "error") continue;
		backend.on(event, (payload) => send(event, payload));
	}
	backend.on("error", ({ error: err }) => send("error", { error: { message: err.message } }));
	backend.on("endpoint:connected", ({ endpointId }) => openEndpoints.add(endpointId));
	backend.on("endpoint:disconnected", ({ endpointId }) => openEndpoints.delete(endpointId));

	backend.on("device:connected", (event) => {
		const device = backend?.getDevice(event.deviceId);
		if (device && enabled && generation === instanceGeneration) {
			void track(bridgeTasks, slimevr.deviceConnected(device)).catch((err) =>
				error(["backend", "slimevr"], "Failed to initialize device:", err),
			);
		}
	});
	backend.on("device:disconnected", ({ deviceId }) => void slimevr?.deviceDisconnected(deviceId));
	backend.on("imu", (sample) => {
		if (enabled && generation === instanceGeneration) slimevr.imu(sample);
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
	const next = transition
		.catch(() => undefined)
		.then(async () => {
			if (!isCurrent()) return;
			slimevr.configure({ slimevrIp: options.slimevr.ip, slimevrPort: options.slimevr.port });
			await stopBlePreview();
			if (!isCurrent()) return;
			const endpoints = await discovery.discover();
			if (!isCurrent()) return;
			for (const endpoint of endpoints) {
				if (!isCurrent()) break;
				if (!options.modes.includes(endpoint.connection)) continue;
				if (endpoint.connection === "ble") {
					const serial = endpoint.displayName.includes("-")
						? endpoint.displayName.slice(endpoint.displayName.indexOf("-") + 1)
						: endpoint.displayName;
					if (!options.bleSerials.includes(serial)) continue;
				} else {
					if (!options.ports.includes(endpoint.id)) continue;
					if (endpoint.model && !options.models.includes(endpoint.model)) continue;
				}
				try {
				const instance = await getBackend();
				if (!isCurrent()) break;
				await instance.connect(endpoint.id);
				} catch (err) {
					error(["backend"], `Failed to connect to ${endpoint.displayName}:`, err);
				}
			}
		});
	transition = next;
	return next;
}

function stopSession(): Promise<void> {
	enabled = false;
	++generation;
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
			for (const endpoint of [...openEndpoints]) {
				try {
					await backend?.disconnect(endpoint);
				} catch (err) {
					error(["backend"], `Failed to disconnect ${endpoint}:`, err);
				}
			}
			await Promise.allSettled([...bridgeTasks]);
			await slimevr.dispose();
			if (backend) await backend.dispose();
			else if (bleConnection) await (await bleConnection).dispose();
			backend = undefined;
			bleConnection = undefined;
			openEndpoints.clear();
		})
		.finally(() => {
			pendingStops--;
		});
	transition = next;
	return next;
}

export const backendCalls: BackendCalls = {
	startSession,
	stopSession,
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
			return discovery.discover();
		}),
	stopDiscovery: discovery.stopDiscovery,
	getEndpoints: () => backend?.getEndpoints() ?? [],
	getDevices: () => backend?.getDevices() ?? [],
	connect: (endpointId) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.connect(endpointId);
		}),
	disconnect: (endpointId) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.disconnect(endpointId);
		}),
	setSettings: (deviceId, settings) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.setSettings(deviceId, settings);
		}),
	setBodyPart: (deviceId, bodyPart) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.setBodyPart(deviceId, bodyPart);
		}),
	powerOff: (deviceId) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.powerOff(deviceId);
		}),
	switchCommunication: (deviceId, mode) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.switchCommunication(deviceId, mode);
		}),
	getChannel: (endpointId) => backend?.getChannel(endpointId),
	setChannel: (endpointId, channel) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.setChannel(endpointId, channel);
		}),
	pair: (endpointId, slot) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.pair(endpointId, slot);
		}),
	unpair: (endpointId, slot) =>
		runEnabled(async (check) => {
			const instance = await getBackend();
			check();
			await instance.unpair(endpointId, slot);
		}),
	sendUserAction: (deviceId, action) => {
		requireEnabled();
		slimevr.sendUserAction(deviceId, action);
	},
	configure: (settings) => slimevr?.configure(settings),
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
	await stopSession();
}
