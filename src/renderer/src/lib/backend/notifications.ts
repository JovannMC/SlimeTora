import { invoke, listen } from "#lib/api/backend";
import { isBridgeAvailable } from "#lib/api/bridge";
import { t } from "#lib/lang/index";
import { error, info } from "#lib/log/index";
import { confirmBleDevice } from "#lib/store/ble-devices";
import { connectedTrackers, knownTrackers, saveTrackerConfig, type BatteryData, type Tracker } from "#lib/store/index";
import {
	tracker as globalTrackerSettings,
	program,
	type TrackerSettings as GlobalTrackerSettings,
} from "#lib/store/settings";
import { setTrackerMotion } from "#lib/store/tracker-motion";
import { ChargeStatus } from "#lib/types/tracker";
import { serialFromBleName } from "#lib/util/index";
import { ToastManager } from "#lib/util/toast.svelte";
import { browser } from "$app/env";
import type { UserActionName } from "$shared/backend/contract";
import type {
	BatteryInfo,
	TrackerSettings as DeviceSettings,
	DeviceSnapshot,
	TrackerSnapshot,
} from "haritorax-interpreter";
import { Quaternion as BetterQuaternion } from "quaternion";
import { get } from "svelte/store";
import { classifyBackendError } from "./error-reporting";
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

const BUTTON_PRESS_WINDOW_MS = 750;
const buttonPressTimestamps: Record<string, number[]> = {};
const buttonActionTimeout: Record<string, ReturnType<typeof setTimeout> | null> = {};

function backendErrorToast(value: Parameters<typeof classifyBackendError>[0]) {
	const { key, params, persistent } = classifyBackendError(value);
	error(["backend", "notifications"], value);
	if (value.context?.connection === "ble" && value.context.operation === "close") return;
	const message = get(t)(`toast.backend.${key}`, params);
	ToastManager.add({ type: "error", message, disappearing: !persistent });
}

function toDeviceSettings(settings: GlobalTrackerSettings): DeviceSettings {
	return {
		fpsMode: settings.fps,
		sensorMode: settings.mode,
		sensorAutoCorrection: [...settings.dynamicCalibration],
		ankleMotionDetection: false,
	};
}

function consumeExpectedPowerOff(trackerId: string): boolean {
	const timer = expectedPowerOffs.get(trackerId);
	if (!timer) return false;
	clearTimeout(timer);
	expectedPowerOffs.delete(trackerId);
	return true;
}

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
	const savedSettings = saved?.settings;
	const globalSettings = get(globalTrackerSettings);
	const rssi = snapshot.rssi ?? device.trackers.find((tracker) => tracker.rssi !== undefined)?.rssi;

	const tracker: Tracker = {
		id: snapshot.trackerId,
		name: current?.name ?? saved?.name ?? snapshot.trackerId,
		connection_mode: MODE_FROM_LIBRARY[device.connection],
		tracker_type: MODEL_FROM_LIBRARY[device.model],
		bodyPart: snapshot.bodyPart,
		settings: savedSettings ?? {
			fps: globalSettings.fps,
			mode: globalSettings.mode,
			dynamicCalibration: [...globalSettings.dynamicCalibration],
			emulatedFeet: globalSettings.emulatedFeet,
		},
		data: {
			...(current?.data ?? { rotation: [0, 0, 0], acceleration: [0, 0, 0] }),
			...(snapshot.mag === undefined ? {} : { magnetometer: MAG_FROM_LIBRARY[snapshot.mag] }),
			...(rssi === undefined ? {} : { rssi }),
			...(snapshot.sensorRssi === undefined ? {} : { sensorRssi: snapshot.sensorRssi }),
		},
	};

	if (!current)
		info(
			["backend", "notifications"],
			`Tracker connected: ${snapshot.trackerId} (${snapshot.bodyPart}) via ${device.connection} ${device.endpointId}`,
		);
	const config = {
		id: tracker.id,
		name: tracker.name,
		connection_mode: tracker.connection_mode,
		tracker_type: tracker.tracker_type,
		bodyPart: tracker.bodyPart,
		settings: savedSettings,
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

const appliedGlobalSettings = new Map<string, string>();
function applyGlobalSettings(device: DeviceSnapshot): void {
	if (!device.trackers.some((item) => item.connected)) return;

	const known = get(knownTrackers);
	if (device.trackers.some((item) => known.find((tracker) => tracker.id === item.trackerId)?.settings)) {
		appliedGlobalSettings.delete(device.deviceId);
		return;
	}

	const settings = toDeviceSettings(get(globalTrackerSettings));
	const fingerprint = JSON.stringify(settings);
	if (appliedGlobalSettings.get(device.deviceId) === fingerprint) return;

	appliedGlobalSettings.set(device.deviceId, fingerprint);
	void invoke("setSettings", device.deviceId, settings).catch((err) => {
		if (appliedGlobalSettings.get(device.deviceId) === fingerprint) appliedGlobalSettings.delete(device.deviceId);
		error(["backend", "settings"], `Failed to apply global tracker settings to ${device.deviceId}: ${String(err)}`);
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

const expectedPowerOffs = new Map<string, ReturnType<typeof setTimeout>>();
export function expectTrackerPowerOff(deviceIds: string[]): (deviceIdsToClear?: string[]) => void {
	const trackerIds = get(connectedTrackers)
		.filter((tracker) => deviceIds.includes(tracker.id.slice(0, tracker.id.lastIndexOf(":"))))
		.map((tracker) => tracker.id);

	for (const trackerId of trackerIds) {
		const previous = expectedPowerOffs.get(trackerId);
		if (previous) clearTimeout(previous);
		expectedPowerOffs.set(
			trackerId,
			setTimeout(() => expectedPowerOffs.delete(trackerId), 10_000),
		);
	}

	return (deviceIdsToClear?: string[]) => {
		for (const trackerId of trackerIds) {
			const deviceId = trackerId.slice(0, trackerId.lastIndexOf(":"));
			if (deviceIdsToClear && !deviceIdsToClear.includes(deviceId)) continue;
			const timer = expectedPowerOffs.get(trackerId);
			if (timer) clearTimeout(timer);
			expectedPowerOffs.delete(trackerId);
		}
	};
}

export function attachNotifications(): () => void {
	let disposed = false;
	let fastData: boolean | undefined;
	const confirmedBleDevices = new Set<string>();
	const disconnectedTrackers = new Set<string>();
	const trackerName = (trackerId: string) =>
		get(connectedTrackers).find((tracker) => tracker.id === trackerId)?.name ??
		get(knownTrackers).find((tracker) => tracker.id === trackerId)?.name ??
		trackerId;
	const unsubscribeProgram = program.subscribe((value) => {
		if (fastData === value.fastData) return;
		fastData = value.fastData;
		if (isBridgeAvailable()) {
			void invoke("setFastData", fastData).catch((err) =>
				error(["backend", "notifications"], `Failed to update data rate: ${String(err)}`),
			);
		}
	});
	const unsubscribeTrackerSettings = globalTrackerSettings.subscribe(() => {
		for (const device of get(backendSnapshot).devices) applyGlobalSettings(device);
	});

	const unlisteners = [
		listen("device:disconnected", ({ deviceId }) => {
			appliedGlobalSettings.delete(deviceId);
			for (const identity of confirmedBleDevices)
				if (identity.startsWith(`${deviceId}:`)) confirmedBleDevices.delete(identity);
			connectedTrackers.update((prev) => prev.filter((t) => !t.id.startsWith(`${deviceId}:`)));
		}),
		listen("tracker:connected", ({ trackerId }) => {
			if (!disconnectedTrackers.delete(trackerId)) return;
			ToastManager.add({
				type: "success",
				message: get(t)("toast.tracker_reconnected", { name: trackerName(trackerId) }),
			});
		}),
		listen("tracker:disconnected", ({ trackerId, reason }) => {
			info(["backend", "notifications"], `Tracker disconnected: ${trackerId} (${reason})`);
			const wasConnected = get(connectedTrackers).some((tracker) => tracker.id === trackerId);
			const expectedPowerOff = consumeExpectedPowerOff(trackerId);
			if (reason !== "requested" && wasConnected && !expectedPowerOff) {
				disconnectedTrackers.add(trackerId);
				ToastManager.add({
					type: "warning",
					message: get(t)("toast.tracker_connection_lost", { name: trackerName(trackerId) }),
				});
			}
			connectedTrackers.update((prev) => prev.filter((t) => t.id !== trackerId));
		}),
		listen("session", ({ status }) => {
			if (status === "off") {
				disconnectedTrackers.clear();
				for (const timer of expectedPowerOffs.values()) clearTimeout(timer);
				expectedPowerOffs.clear();
			}
		}),
		listen("imu", ({ trackerId, rotation, acceleration }) => {
			const euler = new BetterQuaternion(rotation.w, rotation.x, rotation.y, rotation.z)
				.normalize()
				.toEuler("XYZ");

			setTrackerMotion(trackerId, {
				rotation: euler.map((value) => value * (180 / Math.PI)),
				quaternion: rotation,
				acceleration: [acceleration.x, acceleration.y, acceleration.z],
			});
		}),
		listen("battery", onBattery),
		listen("mag", ({ trackerId, status }) => {
			updateTracker(trackerId, (prev) => ({
				...prev,
				data: { ...prev.data, magnetometer: MAG_FROM_LIBRARY[status] },
			}));
		}),
		listen("rssi", ({ deviceId, rssi }) => {
			for (const tracker of trackersOfDevice(deviceId)) {
				updateTracker(tracker.id, (prev) => ({ ...prev, data: { ...prev.data, rssi } }));
			}
		}),
		listen("button", ({ deviceId, trackerId, button }) => {
			info(["backend", "notifications"], `Button ${button} pressed on ${trackerId ?? deviceId}`);
			onButton(deviceId, trackerId, button);
		}),
		listen("error", ({ error: err }) => backendErrorToast(err)),
	];

	const unsubscribeSnapshot = backendSnapshot.subscribe((snapshot) => {
		if (disposed || snapshot.revision < 0) return;
		syncDevices(snapshot.devices);
		for (const device of snapshot.devices) {
			applyGlobalSettings(device);
			if (device.connection !== "ble" || !device.trackers.some((tracker) => tracker.connected)) continue;
			const endpoint = snapshot.endpoints.find((item) => item.id === device.endpointId);
			const advertisedSerial = endpoint ? serialFromBleName(endpoint.displayName) : undefined;
			const identity = `${device.deviceId}:${device.model}:${advertisedSerial ?? ""}`;
			if (confirmedBleDevices.has(identity)) continue;
			confirmedBleDevices.add(identity);
			void confirmBleDevice(device.deviceId, advertisedSerial).catch((err) => {
				confirmedBleDevices.delete(identity);
				error(["backend", "notifications"], `Failed to save BLE device ${device.deviceId}: ${err}`);
			});
		}
	});

	return () => {
		disposed = true;
		unsubscribeSnapshot();
		unsubscribeProgram();
		unsubscribeTrackerSettings();
		for (const unlisten of unlisteners) unlisten();
		for (const timer of Object.values(buttonActionTimeout)) {
			if (timer) clearTimeout(timer);
		}
		for (const key of Object.keys(buttonActionTimeout)) delete buttonActionTimeout[key];
		for (const key of Object.keys(buttonPressTimestamps)) delete buttonPressTimestamps[key];
		disconnectedTrackers.clear();
		info(["backend", "notifications"], "Stopped listening to backend events");
	};
}
