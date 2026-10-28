import { invoke } from "#lib/api/backend";
import { error, info } from "#lib/log/index";
import { activeModes, settings } from "#lib/store/index";
import { ConnectionMode, type ConnectionMode as Mode } from "#lib/types/connection";
import type { TrackerModel } from "#lib/types/tracker";
import type { EndpointDescriptor } from "haritorax-interpreter";
import { get } from "svelte/store";
import { MODE_FROM_LIBRARY, MODEL_FROM_LIBRARY } from "./mapping";
import { attachNotifications } from "./notifications";

// endpoints we connect to: the selected modes, models and ports (dongles and wired serial ports both count as ports)
function matchesSettings(endpoint: EndpointDescriptor, modes: Mode[], models: TrackerModel[], ports: string[]) {
	if (!modes.includes(MODE_FROM_LIBRARY[endpoint.connection])) return false;
	if (endpoint.connection === "serial" && !ports.includes(endpoint.id)) return false;
	if (endpoint.model && !models.includes(MODEL_FROM_LIBRARY[endpoint.model])) return false;
	return true;
}

const activeEndpoints = new Set<string>();
let detachNotifications: (() => void) | undefined;

export async function startInterpreting() {
	const { modes: rawModes, models: rawModels, ports } = get(settings.connection);
	const modes = rawModes as Mode[];
	const models = rawModels as TrackerModel[];

	if (modes.length === 0 || models.length === 0) {
		return error(["backend"], "No modes or model selected for connection");
	}

	if (modes.includes(ConnectionMode.Serial) && ports.length === 0) {
		return error(["backend"], "No ports selected for serial connection");
	}

	info(["backend"], `Starting interpreting with modes: ${modes}, models: ${models}, ports: ${ports}`);

	detachNotifications ??= attachNotifications();

	const endpoints = await invoke("discover");
	for (const endpoint of endpoints) {
		if (!matchesSettings(endpoint, modes, models, ports)) continue;

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

	activeEndpoints.clear();
	activeModes.set([]);
}
