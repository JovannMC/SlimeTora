import { invoke } from "#lib/api/backend";
import { activeModes, isOn, knownTrackers, settings } from "#lib/store/index";
import { ConnectionMode } from "#lib/types/connection";
import { TrackerModel } from "#lib/types/tracker";
import type { ConnectionKind, TrackerModel as LibraryModel } from "haritorax-interpreter";
import { get } from "svelte/store";

const models: Record<TrackerModel, LibraryModel> = {
	[TrackerModel.X2]: "x2",
	[TrackerModel.Wireless]: "wireless",
	[TrackerModel.Wired]: "wired",
};

export async function startInterpreting() {
	const { modes, models: selectedModels, ports, slimevr } = get(settings.connection);
	const bleSerials = [
		...new Set(
			get(knownTrackers)
				.filter((tracker) => tracker.connection_mode === ConnectionMode.BLE)
				.map((tracker) => tracker.id.split(":")[0]!),
		),
	];

	await invoke("startSession", {
		modes: modes as ConnectionKind[],
		models: selectedModels.map((model) => models[model]),
		ports,
		bleSerials,
		slimevr,
	});
	if (get(isOn)) activeModes.set(modes as ConnectionMode[]);
}

export async function stopInterpreting() {
	await invoke("stopSession");
	if (!get(isOn)) activeModes.set([]);
}
