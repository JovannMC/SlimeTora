import { invoke } from "#lib/api/backend";
import { error, info } from "#lib/log/index";
import { activeModes, knownTrackers, settings } from "#lib/store/index";
import { ConnectionMode, type ConnectionMode as Mode } from "#lib/types/connection";
import type { TrackerModel } from "#lib/types/tracker";
import type { EndpointDescriptor } from "haritorax-interpreter";
import { get } from "svelte/store";
import { setKnownEndpoints } from "./endpoints";
import { MODE_FROM_LIBRARY, MODEL_FROM_LIBRARY } from "./mapping";
import { attachNotifications } from "./notifications";
import { serialFromBleName } from "../util";

function matchesSettings(endpoint: EndpointDescriptor, modes: Mode[], models: TrackerModel[], ports: string[]) {
	if (!modes.includes(MODE_FROM_LIBRARY[endpoint.connection])) return false;
	if (endpoint.connection === "serial" && !ports.includes(endpoint.id)) return false;
	if (endpoint.model && !models.includes(MODEL_FROM_LIBRARY[endpoint.model])) return false;
	return true;
}

const activeEndpoints = new Set<string>();
let detachNotifications: (() => void) | undefined;

export async function startInterpreting() {
	const { modes: rawModes, models: rawModels, ports, slimevr } = get(settings.connection);
	const modes = rawModes as Mode[];
	const models = rawModels as TrackerModel[];

	info(["backend"], `Starting interpreting with modes: ${modes}, models: ${models}, ports: ${ports}`);
	info(["backend"], `Active endpoints: ${Array.from(activeEndpoints).join(", ")}`);

	detachNotifications ??= attachNotifications();

	await invoke("configure", { slimevrIp: slimevr.ip, slimevrPort: slimevr.port });

	const endpoints = await invoke("discover");
	setKnownEndpoints(endpoints);

	// reconnect to BLE trackers user paired to before via serial number
	const savedSerials = new Set(
		get(knownTrackers)
			.filter((tracker) => tracker.connection_mode === ConnectionMode.BLE)
			.map((tracker) => tracker.id.split(":")[0]),
	);

	for (const endpoint of endpoints) {
		const isSavedBle = endpoint.connection === "ble" && savedSerials.has(serialFromBleName(endpoint.displayName));
		const matches = endpoint.connection === "ble" ? isSavedBle : matchesSettings(endpoint, modes, models, ports);
		if (!matches) continue;

		try {
			await invoke("connect", endpoint.id);
			activeEndpoints.add(endpoint.id);
			info(["backend"], `Connected to ${endpoint.displayName} (${endpoint.connection})`);
		} catch (err) {
			error(["backend"], `Failed to connect to ${endpoint.displayName}: ${err}`);
		}
	}

	activeModes.set(modes);
}

export async function stopInterpreting() {
	info(["backend"], `Stopping interpreting, disconnecting ${activeEndpoints.size} endpoint(s)`);

	for (const endpointId of activeEndpoints) {
		try {
			await invoke("disconnect", endpointId);
		} catch (err) {
			error(["backend"], `Failed to disconnect ${endpointId}: ${err}`);
		}
	}

	setKnownEndpoints((await invoke("getEndpoints")).filter((endpoint) => endpoint.connection === "ble"));

	activeEndpoints.clear();
	activeModes.set([]);
}
