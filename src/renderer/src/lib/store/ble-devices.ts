import { error } from "#lib/log/index";
import { get, writable } from "svelte/store";
import { trackerStore, updateTrackerStore } from "./tracker-storage";

export interface SavedBleDevice {
	serial: string;
	confirmed: boolean;
	// kept only until an advertised device is confirmed and tracker records provide its name
	advertisedName?: string;
}

export const savedBleDevices = writable<SavedBleDevice[]>([]);

let queue = Promise.resolve();
let loading: Promise<void> | undefined;

export function loadBleDevices(): Promise<void> {
	loading ??= (async () => {
		const config = await trackerStore();
		const devices = await config.get<SavedBleDevice[]>("bleDevices");
		savedBleDevices.set(Array.isArray(devices) ? devices : []);
	})().catch((err) => {
		loading = undefined;
		error(["store"], `Failed to load saved BLE devices: ${err}`);
		throw err;
	});
	return loading;
}

function updateDevices(change: (devices: SavedBleDevice[]) => SavedBleDevice[]): Promise<void> {
	const task = queue.then(async () => {
		await loadBleDevices();
		const devices = change(get(savedBleDevices));
		await updateTrackerStore<SavedBleDevice[]>("bleDevices", () => devices);
		savedBleDevices.set(devices);
	});
	queue = task.catch(() => undefined);
	return task;
}

export function saveBleDevice(device: SavedBleDevice): Promise<void> {
	return updateDevices((devices) => [...devices.filter((saved) => saved.serial !== device.serial), device]);
}

export function confirmBleDevice(serial: string, advertisedSerial?: string): Promise<void> {
	return updateDevices((devices) => {
		const candidate = devices.find((device) => device.serial === advertisedSerial && !device.confirmed);
		return [
			...devices.filter((device) => device.serial !== serial && device !== candidate),
			{ serial, confirmed: true },
		];
	});
}

export function forgetBleDevice(serial: string): Promise<void> {
	return updateDevices((devices) => devices.filter((device) => device.serial !== serial));
}
