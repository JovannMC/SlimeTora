import type {
	BackendCalls,
	BackendEventName,
	BackendEvents,
	BackendSnapshot,
	SessionOptions,
	SessionState,
} from "$shared/backend/contract";
import { BACKEND_EVENTS } from "$shared/backend/contract";
import { Channels, type CapabilityStatus } from "$shared/ipc/channels";
import { BrowserWindow } from "electron";
import type {
	Connection,
	DeviceSnapshot,
	EndpointDescriptor,
	HaritoraX,
	LogEntry,
	TrackerSettings,
} from "haritorax-interpreter";
import { serializeBackendError } from "../../renderer/src/lib/backend/error-reporting";
import {
	noteAnalyticsConnectionStarted,
	noteAnalyticsConnectionStopped,
	noteAnalyticsSetupChanged,
	noteTrackerConnected,
} from "../analytics";
import { handleIpc } from "../ipc/security";
import { debug, error, info, trace, warn } from "../log";
import { getSetting } from "../store";
import { createDiscoveryController } from "./discovery";
import { createImuForwarding } from "./imu-forwarding";
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
const lastButtonAt = new Map<string, Map<"main" | "sub" | "sub2", number>>();
const dongleSlots = new Map<string, Record<string, "paired" | "unpaired">>();
const bridgeTasks = new Set<Promise<unknown>>();
const connecting = new Map<string, Promise<void>>();
const bridgeStarting = new Set<string>();
const pendingBridgeSamples = new Map<string, Map<string, import("haritorax-interpreter").ImuSample>>();
const uiImuForwarding = createImuForwarding();
let activeOptions: SessionOptions | undefined;
const slimevr = new SlimeVRBridge(() => {
	if (enabled) publishSession(sessionState.status, sessionState.error);
});

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
	onError: (target, err, connectedThisSession) => {
		if (connectedThisSession)
			warn(["backend", "reconnect"], `Could not connect to ${target.identity}: ${String(err)}`);
	},
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

async function waitForShutdownTask(task: Promise<unknown>, label: string): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		task.then(
			() => undefined,
			(err) => warn(["backend"], `Shutdown task failed (${label}): ${String(err)}`),
		),
		new Promise<void>((resolve) => {
			timer = setTimeout(() => {
				warn(["backend"], `Timed out waiting for ${label} during shutdown`);
				resolve();
			}, 5_000);
		}),
	]);
	if (timer) clearTimeout(timer);
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

async function loadConnections(
	heartbeatIntervalMs?: number,
	serialPorts: readonly string[] = [],
): Promise<Connection[]> {
	const connections: Connection[] = [];

	try {
		const { createSerialConnection } = await import("haritorax-interpreter/connections/serial");
		let saved: { settings?: { tracker?: { heartbeat?: number } } } | undefined;
		try {
			saved = getSetting("settings.json");
		} catch (err) {
			warn(
				["backend", "settings"],
				`Ignoring unreadable settings while loading serial connection: ${String(err)}`,
			);
		}

		const configuredHeartbeat = saved?.settings?.tracker?.heartbeat;
		const interval =
			typeof heartbeatIntervalMs === "number" && Number.isFinite(heartbeatIntervalMs)
				? Math.max(0, heartbeatIntervalMs)
				: typeof configuredHeartbeat === "number" && Number.isFinite(configuredHeartbeat)
					? Math.max(0, configuredHeartbeat)
					: 2000;

		connections.push(createSerialConnection({ includeWired: true, heartbeatIntervalMs: interval, serialPorts }));
	} catch (err) {
		error(["backend", "serial"], `Serial connection unavailable: ${String(err)}`);
	}

	try {
		connections.push(await getBleConnection());
	} catch (err) {
		error(["backend", "ble"], `BLE connection unavailable: ${String(err)}`);
	}

	return connections;
}

const LOG_FUNCTIONS = { trace, debug, info, warn, error } as const;

function send<E extends BackendEventName>(event: E, payload: BackendEvents[E]): void {
	for (const window of BrowserWindow.getAllWindows()) {
		window.webContents.send(Channels.backendEvent, { event, payload });
	}
}

function publishSession(
	status: SessionState["status"],
	failure?: unknown,
	phase = status === sessionState.status ? sessionState.phase : undefined,
): void {
	sessionState = {
		status,
		...(phase === undefined ? {} : { phase }),
		requestedEnabled: enabled,
		revision: sessionState.revision + 1,
		connectedTrackers: liveTrackers.size,
		slimevrConnected: slimevr.serverConnected,
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
	const connections = await loadConnections(activeOptions?.heartbeatIntervalMs, activeOptions?.ports);
	const modes = activeOptions?.modes ?? [];
	if (!connections.some((connection) => modes.includes(connection.kind))) {
		throw new Error(`No usable connection is available for selected modes: ${modes.join(", ") || "none"}`);
	}

	backend = createHaritoraX({
		connections,
		logLevel: "info",
		onLog: (entry: LogEntry) => {
			const args = entry.data ? [entry.message, entry.data] : [entry.message];
			LOG_FUNCTIONS[entry.level](["haritorax-interpreter"], ...args);
		},
	});
	for (const event of BACKEND_EVENTS) {
		if (event === "error" || event === "imu" || event === "button") continue;
		backend.on(event, (payload) => {
			if (!enabled || generation !== instanceGeneration) return;
			if (event === "tracker:connected") noteTrackerConnected();
			if (event === "device:connected")
				void noteAnalyticsSetupChanged().catch((err) =>
					warn(["analytics"], `Failed to record connected device setup: ${String(err)}`),
				);
			send(event, payload);
		});
	}
	backend.on("error", (event) => {
		if (enabled && generation === instanceGeneration) {
			const serialized = serializeBackendError(event.error);
			const trackerIds = event.endpointId
				? (backend?.getDevices() ?? [])
						.filter((device) => device.endpointId === event.endpointId)
						.flatMap((device) => device.trackers.map((tracker) => tracker.trackerId))
						.join(", ")
				: "";
			send("error", {
				error: {
					...serialized,
					context: {
						...(serialized.context ?? {}),
						...(event.connection ? { connection: event.connection } : {}),
						...(event.endpointId ? { endpointId: event.endpointId } : {}),
						...(trackerIds ? { trackerId: trackerIds } : {}),
						...(event.operation ? { operation: event.operation } : {}),
						...(event.characteristic ? { characteristic: event.characteristic } : {}),
						...(event.command ? { command: event.command } : {}),
						...(event.identifier ? { identifier: event.identifier } : {}),
						...(event.adapterState ? { adapterState: event.adapterState } : {}),
					},
				},
			});
		}
	});
	backend.on("button", (event) => {
		if (!enabled || generation !== instanceGeneration) return;
		const trackerId = event.trackerId ?? event.deviceId;
		const now = Date.now();
		const configuredDebounce = activeOptions?.buttonDebounceMs;
		const debounceMs =
			typeof configuredDebounce === "number" && Number.isFinite(configuredDebounce)
				? Math.max(0, configuredDebounce)
				: 500;

		let buttonTimes = lastButtonAt.get(trackerId);
		if (!buttonTimes) lastButtonAt.set(trackerId, (buttonTimes = new Map()));

		const previous = buttonTimes.get(event.button);
		if (previous !== undefined && now - previous < debounceMs) return;

		buttonTimes.set(event.button, now);
		send("button", event);
	});
	backend.on("endpoint:connected", ({ endpointId }) => {
		if (!enabled || generation !== instanceGeneration) return;
		openEndpoints.add(endpointId);

		const endpoint = backend?.getEndpoints().find((item) => item.id === endpointId);
		if (endpoint) reconnect.bind(endpoint);

		reconnect.connected(endpointId);
		publishSnapshot();
	});
	backend.on("endpoint:disconnected", ({ endpointId, reason }) => {
		if (!enabled || generation !== instanceGeneration) return;
		openEndpoints.delete(endpointId);

		for (const [trackerId, endpoint] of liveTrackers) {
			if (endpoint !== endpointId) continue;
			liveTrackers.delete(trackerId);
			uiImuForwarding.forget(trackerId);
		}

		dongleSlots.delete(endpointId);

		if (reason !== "requested") reconnect.disconnected(endpointId);
		publishSnapshot();
	});
	backend.on("devices", () => {
		if (!enabled || generation !== instanceGeneration) return;
		bindReconnectTargets();
		for (const device of backend?.getDevices() ?? []) {
			if (openEndpoints.has(device.endpointId) && slimevr.hasDevice(device.deviceId)) {
				void track(bridgeTasks, slimevr.deviceConnected(device)).catch((err) =>
					error(["backend", "slimevr"], `Failed to reconcile device ${device.deviceId}: ${String(err)}`),
				);
			}
		}
		publishSnapshot();
	});
	backend.on("tracker:disconnected", ({ trackerId, deviceId, reason }) => {
		if (!enabled || generation !== instanceGeneration) return;
		liveTrackers.delete(trackerId);
		uiImuForwarding.forget(trackerId);
		publishSnapshot();
		void noteAnalyticsSetupChanged().catch((err) =>
			warn(["analytics"], `Failed to record disconnected tracker setup: ${String(err)}`),
		);
		publishSession(sessionState.status, sessionState.error);
		lastButtonAt.delete(trackerId);
		reconnect.refresh();

		const deviceAfterDisconnect = backend?.getDevice(deviceId);
		if (!deviceAfterDisconnect?.trackers.some((tracker) => tracker.connected)) {
			pendingBridgeSamples.delete(deviceId);
			void track(bridgeTasks, slimevr.deviceDisconnected(deviceId)).catch((err) =>
				error(["backend", "slimevr"], `Failed to remove inactive device ${deviceId}: ${String(err)}`),
			);
		}

		if (reason !== "timeout") return;

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
	backend.on("channel", () => {
		if (enabled && generation === instanceGeneration) publishSnapshot();
	});
	for (const event of ["paired", "unpaired"] as const) {
		backend.on(event, ({ endpointId, slot }) => {
			if (!enabled || generation !== instanceGeneration) return;
			dongleSlots.set(endpointId, { ...dongleSlots.get(endpointId), [slot]: event });
			publishSnapshot();
		});
	}

	backend.on("device:disconnected", ({ deviceId }) => {
		if (enabled && generation === instanceGeneration) {
			pendingBridgeSamples.delete(deviceId);
			void track(bridgeTasks, slimevr.deviceDisconnected(deviceId)).catch((err) =>
				error(["backend", "slimevr"], `Failed to remove device ${deviceId}: ${String(err)}`),
			);
		}
	});
	backend.on("imu", (sample) => {
		if (!enabled || generation !== instanceGeneration) return;

		const device = backend?.getDevice(sample.deviceId);
		if (!device) return;

		if (liveTrackers.get(sample.trackerId) !== device.endpointId) {
			liveTrackers.set(sample.trackerId, device.endpointId);
			reconnect.refresh();
			publishSnapshot();
			void noteAnalyticsSetupChanged().catch((err) =>
				warn(["analytics"], `Failed to record live tracker setup: ${String(err)}`),
			);
			publishSession(sessionState.status, sessionState.error);
		}

		if (slimevr.hasDevice(sample.deviceId)) {
			slimevr.imu(sample);
		} else {
			let samples = pendingBridgeSamples.get(sample.deviceId);
			if (!samples) pendingBridgeSamples.set(sample.deviceId, (samples = new Map()));
			samples.set(sample.trackerId, sample);

			if (!bridgeStarting.has(sample.deviceId)) {
				bridgeStarting.add(sample.deviceId);
				const initialize = slimevr
					.deviceConnected(device)
					.then(() => {
						if (!enabled || generation !== instanceGeneration) return;
						for (const pendingSample of pendingBridgeSamples.get(sample.deviceId)?.values() ?? [])
							slimevr.imu(pendingSample);
					})
					.catch((err) => error(["backend", "slimevr"], `Failed to initialize device: ${String(err)}`))
					.finally(() => {
						bridgeStarting.delete(sample.deviceId);
						pendingBridgeSamples.delete(sample.deviceId);
					});
				void track(bridgeTasks, initialize);
			}
		}
		if (uiImuForwarding.shouldSend(sample.trackerId)) send("imu", sample);
	});
	backend.on("battery", (battery) => {
		if (enabled && generation === instanceGeneration) slimevr.battery(battery);
	});

	info(["backend"], "haritorax-interpreter initialized");
	return backend;
}

export async function getTransportCapabilities(): Promise<import("$shared/ipc/channels").Capabilities> {
	const probe = async (kind: "serial" | "bluetooth-le"): Promise<CapabilityStatus> => {
		try {
			if (kind === "serial") {
				const { createSerialConnection } = await import("haritorax-interpreter/connections/serial");
				const connection = createSerialConnection({ includeWired: true });

				try {
					await connection.list({ timeoutMs: 1_000 });
				} finally {
					await connection.dispose();
				}
			} else {
				const { createBleConnection } = await import("haritorax-interpreter/connections/ble");
				const connection = createBleConnection({ rssiPollMs: 2_000 });

				try {
					await connection.list({ timeoutMs: 1_000 });
				} finally {
					await connection.dispose();
				}
			}
			return { available: true };
		} catch (err) {
			const message = String(err);
			const reason = /permission|access denied|not authorized/i.test(message)
				? "permission-missing"
				: /adapter.*off|powered.*off|no adapter/i.test(message)
					? "adapter-off"
					: "binding-failed";

			return { available: false, reason };
		}
	};
	const [serial, bluetooth] = await Promise.all([probe("serial"), probe("bluetooth-le")]);
	return { serial, "bluetooth-le": bluetooth };
}

function startSession(options: SessionOptions): Promise<void> {
	if (enabled) return transition;
	void noteAnalyticsConnectionStarted().catch((err) =>
		warn(["analytics"], `Failed to initialize analytics session state: ${String(err)}`),
	);
	enabled = true;

	const current = ++generation;
	const isCurrent = () => enabled && generation === current;

	publishSession("starting", undefined, "connecting");

	const next = transition
		.then(async () => {
			if (!isCurrent()) return;

			activeOptions = options;
			slimevr.configure({ slimevrIp: options.slimevr.ip, slimevrPort: options.slimevr.port });
			await stopBlePreview();

			if (!isCurrent()) return;
			const endpoints = await discovery.discover();
			if (!isCurrent()) return;
			publishSession("starting", undefined, "searching");

			previewEndpoints = [];
			publishSnapshot();

			for (const endpoint of endpoints) {
				if (!isCurrent()) break;

				if (endpoint.connection !== "serial" || !options.modes.includes("serial")) continue;
				if (!options.ports.includes(endpoint.id)) continue;
				if (endpoint.model && !options.models.includes(endpoint.model)) continue;

				try {
					const instance = await getBackend();
					if (!isCurrent()) break;
					await connectEndpoint(instance, endpoint.id);
				} catch (err) {
					error(["backend"], `Failed to connect to ${endpoint.displayName}: ${String(err)}`);
					if (isCurrent())
						send("error", {
							error: {
								...serializeBackendError(err),
								context: { connection: "serial", endpointId: endpoint.id, operation: "connect" },
							},
						});
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

function stopSession(powerOffTrackers = false): Promise<void> {
	noteAnalyticsConnectionStopped();
	enabled = false;
	uiImuForwarding.reset();
	reconnect.stop();
	const current = ++generation;

	publishSession("stopping");

	pendingStops++;

	const pendingOperations = [...operations];
	const cancelDiscovery = discovery.stopDiscovery().catch((err) => {
		error(["backend"], `Failed to stop discovery: ${String(err)}`);
	});
	const next = transition
		.catch(() => undefined)
		.then(async () => {
			await stopBlePreview();
			await cancelDiscovery;

			if (powerOffTrackers && backend) {
				for (const device of backend.getDevices()) {
					if (device.model === "wired" || !openEndpoints.has(device.endpointId)) continue;
					try {
						await waitForShutdownTask(backend.powerOff(device.deviceId), `powering off ${device.deviceId}`);
					} catch (err) {
						warn(["backend"], `Failed to power off ${device.deviceId} on exit: ${String(err)}`);
					}
				}
			}

			const instance = backend;
			if (instance) await waitForShutdownTask(instance.dispose(), "backend disposal");
			else if (bleConnection)
				await waitForShutdownTask((await bleConnection).dispose(), "BLE connection disposal");
			await waitForShutdownTask(Promise.allSettled(pendingOperations), "backend operations");
			await waitForShutdownTask(Promise.allSettled([...bridgeTasks]), "SlimeVR bridge tasks");

			await slimevr.dispose();

			backend = undefined;
			bleConnection = undefined;
			activeOptions = undefined;

			openEndpoints.clear();
			connecting.clear();
			bridgeStarting.clear();
			pendingBridgeSamples.clear();
			liveTrackers.clear();
			lastButtonAt.clear();
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
	getLatency: (endpointId, options) =>
		withBackend(async (instance) =>
			options ? instance.getLatency(endpointId, options) : instance.getLatency(endpointId),
		),
	refreshTracker: (trackerId) => withBackend((instance) => instance.refreshTracker(trackerId)),
	setFastData: (enabled) => uiImuForwarding.setFastData(enabled),
	setVisibleTrackers: (trackerIds) => uiImuForwarding.setVisibleTrackers(trackerIds),
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
	discoverSerialPorts: async (ports: string[] = []) => {
		const { createSerialConnection } = await import("haritorax-interpreter/connections/serial");
		const serial = createSerialConnection({ includeWired: true, serialPorts: ports });
		try {
			return await serial.list({ signal: AbortSignal.timeout(10_000) });
		} finally {
			await serial.dispose();
		}
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
	setSettings: async (deviceId, settings) => {
		try {
			return await withBackend((instance) => instance.setSettings(deviceId, settings));
		} catch (err) {
			const failure = err as {
				code?: string;
				result?: { applied?: readonly string[]; unsupported?: readonly string[] };
				failures?: readonly { setting?: string }[];
			};
			if (failure.code !== "WRITE_FAILED" || !failure.result?.applied?.length) throw err;
			return {
				applied: [...failure.result.applied] as (keyof TrackerSettings)[],
				unsupported: [...(failure.result.unsupported ?? [])] as (keyof TrackerSettings)[],
				failed: [
					...new Set((failure.failures ?? []).flatMap(({ setting }) => (setting ? [setting] : []))),
				] as (keyof TrackerSettings)[],
			};
		}
	},
	setBodyPart: (deviceId, bodyPart) => withBackend((instance) => instance.setBodyPart(deviceId, bodyPart)),
	powerOff: (deviceIds) =>
		withBackend((instance) => {
			const uniqueIds = [...new Set(Array.isArray(deviceIds) ? deviceIds : [deviceIds])];
			return Promise.all(
				uniqueIds.map(async (deviceId) => {
					try {
						await instance.powerOff(deviceId);
						return { deviceId, success: true };
					} catch (err) {
						return { deviceId, success: false, error: String(err) };
					}
				}),
			);
		}),
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
	handleIpc(Channels.backendInvoke, (_event, command: unknown, args: unknown) => {
		if (typeof command !== "string" || !Object.hasOwn(backendCalls, command)) {
			throw new Error(`Unknown backend command: ${String(command)}`);
		}

		if (!Array.isArray(args)) throw new Error("Invalid backend arguments");
		const call = backendCalls[command as keyof BackendCalls] as (...params: unknown[]) => unknown;
		return call(...args);
	});
}

export async function disposeBackend(): Promise<void> {
	let saved: { settings?: { program?: { autoOff?: boolean } } } | undefined;

	try {
		saved = getSetting("settings.json");
	} catch (err) {
		warn(["backend", "settings"], `Ignoring unreadable settings during shutdown: ${String(err)}`);
	}

	await stopSession(saved?.settings?.program?.autoOff === true);
}
