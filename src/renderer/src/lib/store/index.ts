import { load } from "#lib/api/store";
import { startInterpreting, stopInterpreting } from "#lib/backend/index";
import { error, info } from "#lib/log/index";
import type { ConnectionMode } from "#lib/types/connection";
import type { ChargeStatus, MagStatus, TrackerModel } from "#lib/types/tracker";
import { DISCORD_URL, GITHUB_URL } from "#lib/util/consts.ts";
import { writable, type Writable } from "svelte/store";
import { connection, type TrackerSettings } from "./settings";

export * as settings from "./settings";

let trackersConfig: Awaited<ReturnType<typeof load>>;

export interface BatteryData {
	remaining?: number;
	voltage?: number;
	status?: ChargeStatus;
}

export interface Tracker {
	// Info
	id: string; // does NOT change and should be unique (MAC address or serial num (in format of bt names: HaritoraX()-(serial)?)
	name: string; // can be user-set
	connection_mode: ConnectionMode;
	tracker_type: TrackerModel;
	mac?: string;
	settings?: Omit<TrackerSettings, "heartbeat" | "buttonDebounce">;

	// Data
	data: TrackerData;
}

export interface TrackerData {
	rotation: number[];
	acceleration: number[];
	magnetometer?: MagStatus;
	battery?: BatteryData;
	rssi?: number;
}

export type TrackerSave = Omit<Tracker, "data">;

export const connectedTrackers = writable<Tracker[]>([]);
export const knownTrackers = writable<Tracker[]>([]);

export const trackerOpenStates = writable<Record<string, boolean>>({});

(async () => {
	try {
		trackersConfig = await load("home.json", { autoSave: true });

		try {
			const loaded = await trackersConfig.get("trackers");
			if (loaded && typeof loaded === "object") {
				// for every Tracker in loaded, place into knownTrackers
				knownTrackers.set(Object.values(loaded));

				const macAddresses: string[] = Object.values(loaded)
					.filter((tracker) => tracker.mac)
					.map((tracker) => tracker.mac!);

				info(["store"], `Loaded MAC addresses of paired BT trackers: ${macAddresses}`);

				// update connection settings with loaded mac addresses
				connection.update((settings) => ({ ...settings, macAddresses }));
			}
			info(["store"], `Loaded settings from trackers.json: ${JSON.stringify(loaded, null, 2)}`);
		} catch (e) {
			error(["store"], `Failed to load settings from trackers.json: ${e}`);
		}
	} catch (e) {
		error(["store"], `Failed to load trackers.json: ${e}`);
	}
})();

export async function saveTrackerConfig(tracker: TrackerSave) {
	if (!trackersConfig) {
		error(["store"], "Trackers config not loaded yet.");
		return;
	}

	try {
		const settings = (await trackersConfig.get("trackers")) || {};
		await trackersConfig.set("trackers", {
			...settings,
			[tracker.id]: tracker,
		});
		await trackersConfig.save();
		info(["store"], `Tracker ${tracker.id} saved to trackers.json`);
	} catch (e) {
		error(["store"], `Failed to save tracker ${tracker.id} to trackers.json: ${e}`);
	}
}

export async function getTrackerConfig(id: string): Promise<TrackerSave | undefined> {
	if (!trackersConfig) {
		error(["store"], "Trackers config not loaded yet.");
		return;
	}

	try {
		const settings = await trackersConfig.get("trackers");
		if (!settings || typeof settings !== "object") return undefined;
		return (settings as Record<string, TrackerSave>)[id] as TrackerSave | undefined;
	} catch (e) {
		error(["store"], `Failed to get tracker config for id ${id}: ${e}`);
		return undefined;
	}
}

export const activeModes = writable<ConnectionMode[]>([]);
// null if first time / app just launched
export const isOn: Writable<boolean | null> = writable(null);
isOn.subscribe(async (value) => {
	info(["store"], `isOn: ${value}`);
	if (value) {
		startInterpreting();
	} else if (value === false) {
		stopInterpreting();
	}
});

export const currentPath = writable("/");

export const navLinks = [
	{
		label: "nav.home",
		icon: "ri:gps-line",
		active: "ri:gps-fill",
		link: "/",
	},
	{
		label: "nav.settings",
		icon: "ri:equalizer-line",
		active: "ri:equalizer-fill",
		link: "/settings",
	},
	{
		label: "nav.about",
		icon: "ri:information-line",
		active: "ri:information-fill",
		link: "/about",
	},
];

export const externalNavLinks = [
	{
		name: "GitHub",
		icon: "ri:github-line",
		link: GITHUB_URL,
	},
	{
		name: "Discord",
		icon: "ri:discord-line",
		link: DISCORD_URL,
	},
	{
		name: "Help",
		icon: "ri:question-line",
		link: `${GITHUB_URL}/wiki/`,
	},
];
