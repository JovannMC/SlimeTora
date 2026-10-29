import type { BackendCalls, BackendEventName, BackendEvents } from "$shared/backend/contract";
import { BACKEND_EVENTS } from "$shared/backend/contract";
import { Channels } from "$shared/ipc/channels";
import { BrowserWindow, ipcMain } from "electron";
import type { Connection, HaritoraX, LogEntry } from "haritorax-interpreter";
import { debug, error, info, trace, warn } from "../log";
import { SlimeVRBridge } from "./slimevr";

let backend: HaritoraX | undefined;
export let slimevr = new SlimeVRBridge();

async function loadConnections(): Promise<Connection[]> {
	const connections: Connection[] = [];

	try {
		const { createSerialConnection } = await import("haritorax-interpreter/connections/serial");
		connections.push(createSerialConnection({ includeWired: true }));
	} catch (err) {
		error(["backend", "serial"], "Serial connection unavailable:", err);
	}

	try {
		const { createBleConnection } = await import("haritorax-interpreter/connections/ble");
		connections.push(createBleConnection({ rssiPollMs: 2_000 }));
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

async function getBackend(): Promise<HaritoraX> {
	if (backend) return backend;

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

	backend.on("device:connected", (event) => {
		const device = backend?.getDevice(event.deviceId);
		if (device) void slimevr?.deviceConnected(device);
	});
	backend.on("device:disconnected", ({ deviceId }) => void slimevr?.deviceDisconnected(deviceId));
	backend.on("imu", (sample) => slimevr?.imu(sample));
	backend.on("battery", (battery) => slimevr?.battery(battery));

	info(["backend"], "Backend started");
	return backend;
}

export const backendCalls: BackendCalls = {
	discover: async () => (await getBackend()).discover(),
	stopDiscovery: async () => (await getBackend()).stopDiscovery(),
	getEndpoints: () => backend?.getEndpoints() ?? [],
	getDevices: () => backend?.getDevices() ?? [],
	connect: async (endpointId) => (await getBackend()).connect(endpointId),
	disconnect: async (endpointId) => (await getBackend()).disconnect(endpointId),
	setSettings: async (deviceId, settings) => (await getBackend()).setSettings(deviceId, settings),
	setBodyPart: async (deviceId, bodyPart) => (await getBackend()).setBodyPart(deviceId, bodyPart),
	powerOff: async (deviceId) => (await getBackend()).powerOff(deviceId),
	switchCommunication: async (deviceId, mode) => (await getBackend()).switchCommunication(deviceId, mode),
	getChannel: (endpointId) => backend?.getChannel(endpointId),
	setChannel: async (endpointId, channel) => (await getBackend()).setChannel(endpointId, channel),
	pair: async (endpointId, slot) => (await getBackend()).pair(endpointId, slot),
	unpair: async (endpointId, slot) => (await getBackend()).unpair(endpointId, slot),
	sendUserAction: (deviceId, action) => slimevr?.sendUserAction(deviceId, action),
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
	await slimevr?.dispose();
	await backend?.dispose();
	backend = undefined;
}
