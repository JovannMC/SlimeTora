import { load, type Store } from "#lib/api/store";
import { error } from "#lib/log/index";
import { ConnectionMode } from "#lib/types/connection";
import type { TrackerModel } from "#lib/types/tracker";
import { get, writable } from "svelte/store";
import type { TrackerSave } from "./index";

export interface SavedBleDevice {
	serial: string;
	name: string;
	model?: TrackerModel;
	confirmed: boolean;
}

export const savedBleDevices = writable<SavedBleDevice[]>([]);

let config: Store | undefined;
let queue = Promise.resolve();

export const bleDevicesLoaded = (async () => {
	config = await load("ble-devices.json");

	const saved = await config.get<SavedBleDevice[]>("devices");
	if (Array.isArray(saved)) {
		savedBleDevices.set(saved.filter((device) => typeof device?.serial === "string" && !!device.serial));
		return;
	}

	const trackersStore = await load("trackers.json");
	const trackers = await trackersStore.get<Record<string, TrackerSave>>("trackers");
	const migrated = new Map<string, SavedBleDevice>();

	for (const tracker of Object.values(trackers ?? {})) {
		if (tracker.connection_mode !== ConnectionMode.BLE) continue;
		const serial = tracker.id.split(":")[0]!;
		if (serial && !migrated.has(serial))
			migrated.set(serial, { serial, name: tracker.name, model: tracker.tracker_type, confirmed: true });
	}

	const devices = [...migrated.values()];
	await config.set("devices", devices);

	savedBleDevices.set(devices);
})().catch((err) => {
	error(["store"], `Failed to load saved BLE devices: ${err}`);
	throw err;
});

void bleDevicesLoaded.catch(() => undefined);

function updateDevices(change: (devices: SavedBleDevice[]) => SavedBleDevice[]): Promise<void> {
	const task = queue.then(async () => {
		await bleDevicesLoaded;
		if (!config) throw new Error("Saved BLE device storage is unavailable");
		const devices = change(get(savedBleDevices));
		await config.set("devices", devices);
		savedBleDevices.set(devices);
	});
	queue = task.catch(() => undefined);
	return task;
}

export function saveBleDevice(device: SavedBleDevice): Promise<void> {
	return updateDevices((devices) => [...devices.filter((saved) => saved.serial !== device.serial), device]);
}

export function confirmBleDevice(serial: string, model: TrackerModel, advertisedSerial?: string): Promise<void> {
	return updateDevices((devices) => {
		const existing = devices.find((device) => device.serial === serial);
		const candidate = devices.find((device) => device.serial === advertisedSerial && !device.confirmed);
		return [
			...devices.filter((device) => device.serial !== serial && device !== candidate),
			{
				serial,
				name: existing?.name ?? candidate?.name ?? serial,
				model,
				confirmed: true,
			},
		];
	});
}

export function forgetBleDevice(serial: string): Promise<void> {
	return updateDevices((devices) => devices.filter((device) => device.serial !== serial));
}
