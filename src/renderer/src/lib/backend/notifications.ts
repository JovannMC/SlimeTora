import { invoke, listen } from "#lib/api/backend";
import { error, info } from "#lib/log/index";
import { connectedTrackers, saveTrackerConfig, type BatteryData, type Tracker } from "#lib/store/index";
import { program } from "#lib/store/settings";
import { ChargeStatus, SensorAutoCorrection } from "#lib/types/tracker";
import { browser } from "$app/env";
import type { UserActionName } from "$shared/backend/contract";
import type { BatteryInfo, ConnectionKind, TrackerModel as LibraryModel } from "haritorax-interpreter";
import { get } from "svelte/store";
import { MAG_FROM_LIBRARY, MODE_FROM_LIBRARY, MODEL_FROM_LIBRARY } from "./mapping";

let fastData = get(program).fastData;
program.subscribe((value) => {
	fastData = value.fastData;
});

const devices = new Map<string, { connection: ConnectionKind; model: LibraryModel }>();

function updateTracker(trackerId: string, change: (tracker: Tracker) => Tracker) {
	connectedTrackers.update((prev) => {
		const index = prev.findIndex((t) => t.id === trackerId);
		const current = prev[index];
		if (!current) return prev;
		return [...prev.slice(0, index), change(current), ...prev.slice(index + 1)];
	});
}

function trackersOfDevice(deviceId: string) {
	return get(connectedTrackers).filter((t) => t.id.startsWith(`${deviceId}:`));
}

const lastImuUpdate: Record<string, number> = {};
const BUTTON_PRESS_WINDOW_MS = 750;
const BUTTON_DEBOUNCE_MS = 200;
const buttonPressTimestamps: Record<string, number[]> = {};
const buttonActionTimeout: Record<string, ReturnType<typeof setTimeout> | null> = {};

function onButton(deviceId: string, trackerId: string | undefined) {
	const key = trackerId ?? deviceId;
	const now = Date.now();
	const timestamps = (buttonPressTimestamps[key] ??= []);
	const last = timestamps[timestamps.length - 1] ?? 0;
	if (now - last < BUTTON_DEBOUNCE_MS) return;

	timestamps.push(now);
	buttonPressTimestamps[key] = timestamps.filter((ts) => now - ts <= BUTTON_PRESS_WINDOW_MS);

	if (buttonActionTimeout[key]) clearTimeout(buttonActionTimeout[key]);

	buttonActionTimeout[key] = setTimeout(() => {
		const pressCount = buttonPressTimestamps[key]?.length ?? 0;
		const actions: Record<number, UserActionName> = {
			1: "ResetYaw",
			2: "Reset",
			3: "ResetMounting",
		};
		const action: UserActionName | undefined = pressCount >= 4 ? "PauseTracking" : actions[pressCount];

		if (action) {
			info(["backend", "notifications"], `Sending action ${action} from ${pressCount} presses: ${key}`);
			invoke("sendUserAction", deviceId, action).catch((err) =>
				error(["backend", "notifications"], `Failed to send action ${action}: ${err}`),
			);
		}
		buttonPressTimestamps[key] = [];
		buttonActionTimeout[key] = null;
	}, BUTTON_PRESS_WINDOW_MS);
}

function onTrackerConnected(payload: { trackerId: string; deviceId: string; bodyPart: string }) {
	if (!browser) return;

	const device = devices.get(payload.deviceId);
	const connection = device?.connection ?? "serial";
	const model = device?.model ?? "wired";

	const tracker: Tracker = {
		id: payload.trackerId,
		name: payload.trackerId,
		connection_mode: MODE_FROM_LIBRARY[connection],
		tracker_type: MODEL_FROM_LIBRARY[model],
		bodyPart: payload.bodyPart,
		settings: {
			fps: 50,
			mode: 1,
			dynamicCalibration: [SensorAutoCorrection.Accel],
			emulatedFeet: false,
		},
		data: { rotation: [0, 0, 0], acceleration: [0, 0, 0] },
	};

	info(["backend", "notifications"], `Tracker connected: ${payload.trackerId} (${payload.bodyPart})`);
	saveTrackerConfig({
		id: tracker.id,
		name: tracker.name,
		connection_mode: tracker.connection_mode,
		tracker_type: tracker.tracker_type,
		bodyPart: tracker.bodyPart,
		settings: tracker.settings,
	});

	connectedTrackers.update((prev) => {
		const index = prev.findIndex((t) => t.id === tracker.id);
		const current = prev[index];
		if (!current) return [...prev, tracker];
		return [...prev.slice(0, index), { ...current, ...tracker, data: current.data }, ...prev.slice(index + 1)];
	});
}

function onBattery(battery: BatteryInfo) {
	const batteryData: BatteryData = {
		remaining: battery.level ?? undefined,
		voltage: battery.voltage ?? undefined,
		status:
			battery.chargeStatus && battery.chargeStatus !== "unknown"
				? (battery.chargeStatus as ChargeStatus)
				: undefined,
	};

	for (const tracker of trackersOfDevice(battery.deviceId)) {
		updateTracker(tracker.id, (prev) => ({ ...prev, data: { ...prev.data, battery: batteryData } }));
	}
}

export function attachNotifications(): () => void {
	const unlisteners = [
		listen("device:connected", ({ deviceId, connection, model }) => {
			devices.set(deviceId, { connection, model });
		}),
		listen("device:disconnected", ({ deviceId }) => {
			devices.delete(deviceId);
			connectedTrackers.update((prev) => prev.filter((t) => !t.id.startsWith(`${deviceId}:`)));
		}),
		listen("tracker:connected", onTrackerConnected),
		listen("tracker:disconnected", ({ trackerId }) => {
			connectedTrackers.update((prev) => prev.filter((t) => t.id !== trackerId));
		}),
		listen("imu", ({ trackerId, rotation, acceleration }) => {
			const now = Date.now();
			if (!fastData && lastImuUpdate[trackerId] && now - lastImuUpdate[trackerId] < 50) return;
			lastImuUpdate[trackerId] = now;

			updateTracker(trackerId, (prev) => ({
				...prev,
				data: {
					...prev.data,
					rotation: [rotation.x, rotation.y, rotation.z],
					acceleration: [acceleration.x, acceleration.y, acceleration.z],
				},
			}));
		}),
		listen("battery", onBattery),
		listen("mag", ({ trackerId, status }) => {
			updateTracker(trackerId, (prev) => ({
				...prev,
				data: { ...prev.data, magnetometer: MAG_FROM_LIBRARY[status] },
			}));
		}),
		listen("rssi", ({ trackerId, rssi }) => {
			updateTracker(trackerId, (prev) => ({ ...prev, data: { ...prev.data, rssi } }));
		}),
		listen("button", ({ deviceId, trackerId, button }) => {
			info(["backend", "notifications"], `Button ${button} pressed on ${trackerId ?? deviceId}`);
			onButton(deviceId, trackerId);
		}),
		listen("error", ({ error: err }) => error(["backend", "notifications"], err.message)),
	];

	return () => {
		for (const unlisten of unlisteners) unlisten();
		info(["backend", "notifications"], "Stopped listening to backend events");
	};
}
