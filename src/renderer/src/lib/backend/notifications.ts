import { invoke, listen } from "#lib/api/backend";
import { error, info } from "#lib/log/index";
import { confirmBleDevice } from "#lib/store/ble-devices";
import { connectedTrackers, knownTrackers, saveTrackerConfig, type BatteryData, type Tracker } from "#lib/store/index";
import { program } from "#lib/store/settings";
import { ChargeStatus, SensorAutoCorrection } from "#lib/types/tracker";
import { serialFromBleName } from "#lib/util/index";
import { browser } from "$app/env";
import type { UserActionName } from "$shared/backend/contract";
import type { BatteryInfo, DeviceSnapshot, TrackerSnapshot } from "haritorax-interpreter";
import { Quaternion as BetterQuaternion } from "quaternion";
import { get } from "svelte/store";
import { MAG_FROM_LIBRARY, MODE_FROM_LIBRARY, MODEL_FROM_LIBRARY } from "./mapping";
import { backendSnapshot } from "./state";

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
const buttonPressTimestamps: Record<string, number[]> = {};
const buttonActionTimeout: Record<string, ReturnType<typeof setTimeout> | null> = {};

function onButton(deviceId: string, trackerId: string | undefined, button: "main" | "sub" | "sub2") {
	const tracker = trackerId ?? deviceId;
	const key = `${tracker}:${button}`;
	const now = Date.now();
	const timestamps = (buttonPressTimestamps[key] ??= []);

	if (timestamps.length > 0 && now - timestamps[timestamps.length - 1]! > BUTTON_PRESS_WINDOW_MS) {
		timestamps.length = 0;
	}
	timestamps.push(now);

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
			info(
				["backend", "notifications"],
				`Sending action ${action} from ${pressCount} ${pressCount === 1 ? "press" : "presses"}: ${tracker}`,
			);
			invoke("sendUserAction", deviceId, action).catch((err) =>
				error(["backend", "notifications"], `Failed to send action ${action}: ${err}`),
			);
		}
		buttonPressTimestamps[key] = [];
		buttonActionTimeout[key] = null;
	}, BUTTON_PRESS_WINDOW_MS);
}

function onTrackerConnected(device: DeviceSnapshot, snapshot: TrackerSnapshot) {
	if (!browser) return;

	const current = get(connectedTrackers).find((tracker) => tracker.id === snapshot.trackerId);
	const saved = get(knownTrackers).find((tracker) => tracker.id === snapshot.trackerId);

	const tracker: Tracker = {
		id: snapshot.trackerId,
		name: current?.name ?? saved?.name ?? snapshot.trackerId,
		connection_mode: MODE_FROM_LIBRARY[device.connection],
		tracker_type: MODEL_FROM_LIBRARY[device.model],
		bodyPart: snapshot.bodyPart,
		settings: current?.settings ??
			saved?.settings ?? {
				fps: 50,
				mode: 1,
				dynamicCalibration: [SensorAutoCorrection.Accel],
				emulatedFeet: false,
			},
		data: {
			...(current?.data ?? { rotation: [0, 0, 0], acceleration: [0, 0, 0] }),
			...(snapshot.mag === undefined ? {} : { magnetometer: MAG_FROM_LIBRARY[snapshot.mag] }),
			...(snapshot.rssi === undefined ? {} : { rssi: snapshot.rssi }),
		},
	};

	if (!current) info(["backend", "notifications"], `Tracker connected: ${snapshot.trackerId} (${snapshot.bodyPart})`);
	const config = {
		id: tracker.id,
		name: tracker.name,
		connection_mode: tracker.connection_mode,
		tracker_type: tracker.tracker_type,
		bodyPart: tracker.bodyPart,
		settings: tracker.settings,
	};
	if (
		!saved ||
		saved.connection_mode !== config.connection_mode ||
		saved.tracker_type !== config.tracker_type ||
		saved.bodyPart !== config.bodyPart
	) {
		void saveTrackerConfig(config);
	}

	connectedTrackers.update((prev) => {
		const index = prev.findIndex((t) => t.id === tracker.id);
		const current = prev[index];
		if (!current) return [...prev, tracker];
		return [...prev.slice(0, index), tracker, ...prev.slice(index + 1)];
	});
}

function syncDevices(snapshots: DeviceSnapshot[]) {
	const connectedIds = new Set<string>();
	for (const device of snapshots) {
		for (const tracker of device.trackers) {
			if (!tracker.connected) continue;
			connectedIds.add(tracker.trackerId);
			onTrackerConnected(device, tracker);
		}
		if (device.battery) onBattery(device.battery);
	}
	connectedTrackers.update((trackers) => trackers.filter((tracker) => connectedIds.has(tracker.id)));
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
	let disposed = false;
	let fastData = false;
	const confirmedBleDevices = new Set<string>();
	const unsubscribeProgram = program.subscribe((value) => {
		fastData = value.fastData;
	});
	const unlisteners = [
		listen("device:disconnected", ({ deviceId }) => {
			for (const identity of confirmedBleDevices)
				if (identity.startsWith(`${deviceId}:`)) confirmedBleDevices.delete(identity);
			connectedTrackers.update((prev) => prev.filter((t) => !t.id.startsWith(`${deviceId}:`)));
		}),
		listen("tracker:disconnected", ({ trackerId, reason }) => {
			delete lastImuUpdate[trackerId];
			info(["backend", "notifications"], `Tracker disconnected: ${trackerId} (${reason})`);
			connectedTrackers.update((prev) => prev.filter((t) => t.id !== trackerId));
		}),
		listen("imu", ({ trackerId, rotation, acceleration }) => {
			const now = Date.now();
			if (!fastData && lastImuUpdate[trackerId] && now - lastImuUpdate[trackerId] < 50) return;
			lastImuUpdate[trackerId] = now;

			const euler = new BetterQuaternion(rotation.w, rotation.x, rotation.y, rotation.z).toEuler();

			const rotationDisplay = {
				x: euler[0] * (180 / Math.PI),
				y: euler[1] * (180 / Math.PI),
				z: euler[2] * (180 / Math.PI),
			};

			updateTracker(trackerId, (prev) => ({
				...prev,
				data: {
					...prev.data,
					rotation: [rotationDisplay.x, rotationDisplay.y, rotationDisplay.z],
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
			onButton(deviceId, trackerId, button);
		}),
		listen("error", ({ error: err }) => error(["backend", "notifications"], err.message)),
	];

	const unsubscribeSnapshot = backendSnapshot.subscribe((snapshot) => {
		if (disposed || snapshot.revision < 0) return;
		syncDevices(snapshot.devices);
		for (const device of snapshot.devices) {
			if (device.connection !== "ble" || !device.trackers.some((tracker) => tracker.connected)) continue;
			const endpoint = snapshot.endpoints.find((item) => item.id === device.endpointId);
			const advertisedSerial = endpoint ? serialFromBleName(endpoint.displayName) : undefined;
			const identity = `${device.deviceId}:${device.model}:${advertisedSerial ?? ""}`;
			if (confirmedBleDevices.has(identity)) continue;
			confirmedBleDevices.add(identity);
			void confirmBleDevice(device.deviceId, MODEL_FROM_LIBRARY[device.model], advertisedSerial).catch((err) => {
				confirmedBleDevices.delete(identity);
				error(["backend", "notifications"], `Failed to save BLE device ${device.deviceId}: ${err}`);
			});
		}
	});

	return () => {
		disposed = true;
		unsubscribeSnapshot();
		unsubscribeProgram();
		for (const unlisten of unlisteners) unlisten();
		for (const timer of Object.values(buttonActionTimeout)) {
			if (timer) clearTimeout(timer);
		}
		for (const key of Object.keys(buttonActionTimeout)) delete buttonActionTimeout[key];
		for (const key of Object.keys(buttonPressTimestamps)) delete buttonPressTimestamps[key];
		for (const key of Object.keys(lastImuUpdate)) delete lastImuUpdate[key];
		info(["backend", "notifications"], "Stopped listening to backend events");
	};
}
