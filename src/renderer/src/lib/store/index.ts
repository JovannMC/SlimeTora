import { load } from "#lib/api/store";
import { startInterpreting, stopInterpreting } from "#lib/backend/index";
import { error, info } from "#lib/log/index";
import type { ConnectionMode } from "#lib/types/connection";
import type { ChargeStatus, MagStatus, TrackerModel } from "#lib/types/tracker";
import { DISCORD_URL, GITHUB_URL } from "#lib/util/consts.ts";
import { writable, type Writable } from "svelte/store";
import type { TrackerSettings } from "./settings";

export * as settings from "./settings";

let trackersConfig: Awaited<ReturnType<typeof load>>;

export interface BatteryData {
	remaining?: number;
	voltage?: number;
	status?: ChargeStatus;
}

export interface Tracker {
	// Info
	id: string; // does NOT change and should be unique: `serial:imuIndex`
	name: string; // can be user-set
	connection_mode: ConnectionMode;
	tracker_type: TrackerModel;
	bodyPart?: string;
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
export const knownTrackers = writable<TrackerSave[]>([]);

export const trackerOpenStates = writable<Record<string, boolean>>({});

// resolves once the saved trackers have been loaded into knownTrackers
export const trackersLoaded: Promise<void> = (async () => {
	try {
		trackersConfig = await load("trackers.json", { autoSave: true });

		try {
			const loaded = await trackersConfig.get("trackers");
			if (loaded && typeof loaded === "object") {
				// for every Tracker in loaded, place into knownTrackers
				knownTrackers.set(Object.values(loaded));
			}
			info(["store"], `Loaded settings from trackers.json: ${JSON.stringify(loaded, null, 2)}`);
		} catch (e) {
			error(["store"], `Failed to load settings from trackers.json: ${e}`);
		}
	} catch (e) {
		error(["store"], `Failed to load trackers.json: ${e}`);
	}
})();

let trackerSaveQueue = Promise.resolve();

export function saveTrackerConfig(tracker: TrackerSave): Promise<void> {
	trackerSaveQueue = trackerSaveQueue
		.then(async () => {
			await trackersLoaded;
			if (!trackersConfig) return;
			const settings = (await trackersConfig.get<Record<string, TrackerSave>>("trackers")) || {};
			const saved = settings[tracker.id];
			if (
				saved &&
				saved.name === tracker.name &&
				saved.connection_mode === tracker.connection_mode &&
				saved.tracker_type === tracker.tracker_type &&
				saved.bodyPart === tracker.bodyPart &&
				JSON.stringify(saved.settings ?? null) === JSON.stringify(tracker.settings ?? null)
			)
				return;
			await trackersConfig.set("trackers", {
				...settings,
				[tracker.id]: tracker,
			});
			await trackersConfig.save();
			knownTrackers.update((trackers) => [...trackers.filter((saved) => saved.id !== tracker.id), tracker]);
			info(["store"], `Tracker ${tracker.id} saved to trackers.json`);
		})
		.catch((e) => {
			error(["store"], `Failed to save tracker ${tracker.id} to trackers.json: ${e}`);
		});
	return trackerSaveQueue;
}

// null if first time / app just launched
export const isOn: Writable<boolean | null> = writable(null);
let restoringRequestedState = false;
export function restoreRequestedState(value: boolean) {
	restoringRequestedState = true;
	try {
		isOn.set(value);
	} finally {
		restoringRequestedState = false;
	}
}
isOn.subscribe(async (value) => {
	if (restoringRequestedState) return;
	info(["store"], `isOn: ${value}`);
	if (value) {
		void startInterpreting().catch((err) => error(["backend"], `Failed to start tracking: ${err}`));
	} else if (value === false) {
		void stopInterpreting().catch((err) => error(["backend"], `Failed to stop tracking: ${err}`));
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
