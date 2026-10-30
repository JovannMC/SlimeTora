import { invoke } from "#lib/api/backend";
import { error } from "#lib/log/index";
import { bleDevicesLoaded, savedBleDevices } from "#lib/store/ble-devices";
import { derived } from "svelte/store";
import { sessionState } from "./state";

export function attachBleTargets(): () => void {
	let disposed = false;
	let last = "";
	let unsubscribe = () => {};

	const combined = derived([savedBleDevices, sessionState], ([$devices, $session]) => ({
		devices: $devices,
		session: $session,
	}));

	function update(devices: { serial: string }[], status: string) {
		if (status !== "on") {
			last = "";
			return;
		}
		const serials = devices.map((device) => device.serial).sort();
		const value = JSON.stringify(serials);
		if (value === last) return;
		last = value;
		void invoke("updateBleTargets", serials).catch((err) => {
			last = "";
			if (!disposed) error(["backend"], `Failed to update BLE targets: ${err}`);
		});
	}

	void bleDevicesLoaded
		.then(() => {
			if (disposed) return;
			unsubscribe = combined.subscribe(({ devices, session }) => update(devices, session.status));
		})
		.catch(() => undefined);

	return () => {
		disposed = true;
		unsubscribe();
	};
}
