import { invoke } from "#lib/api/backend";
import { t } from "#lib/lang/index";
import { bleDevicesLoaded, savedBleDevices } from "#lib/store/ble-devices";
import { isOn, settings } from "#lib/store/index";
import { TrackerModel } from "#lib/types/tracker";
import { ToastManager } from "#lib/util/toast.svelte";
import type { ConnectionKind, TrackerModel as LibraryModel } from "haritorax-interpreter";
import { get } from "svelte/store";

const models: Record<TrackerModel, LibraryModel> = {
	[TrackerModel.X2]: "x2",
	[TrackerModel.Wireless]: "wireless",
	[TrackerModel.Wired]: "wired",
};

export async function startInterpreting(): Promise<boolean | void> {
	await bleDevicesLoaded;
	if (!get(isOn)) return;

	const { modes, models: selectedModels, ports, slimevr } = get(settings.connection);
	const translate = get(t);
	const missingConfiguration =
		modes.length === 0
			? translate("toast.no_connection_mode")
			: selectedModels.length === 0
				? translate("toast.no_tracker_model")
				: modes.includes("serial") && ports.length === 0
					? translate("toast.no_serial_ports")
					: undefined;
	if (missingConfiguration) {
		ToastManager.add({ type: "warning", message: missingConfiguration, disappearing: false });
		isOn.set(false);
		return false;
	}

	const configuredHeartbeat = get(settings.tracker).heartbeat;
	const heartbeatIntervalMs =
		Number.isFinite(configuredHeartbeat) && configuredHeartbeat >= 0 ? configuredHeartbeat : 2000;

	const configuredButtonDebounce = get(settings.tracker).buttonDebounce;
	const buttonDebounceMs =
		Number.isFinite(configuredButtonDebounce) && configuredButtonDebounce >= 0 ? configuredButtonDebounce : 500;

	const bleSerials = get(savedBleDevices).map((device) => device.serial);

	await invoke("startSession", {
		modes: modes as ConnectionKind[],
		models: selectedModels.map((model) => models[model]),
		ports,
		bleSerials,
		heartbeatIntervalMs,
		buttonDebounceMs,
		slimevr,
	});
	return true;
}

export function stopInterpreting() {
	return invoke("stopSession");
}
