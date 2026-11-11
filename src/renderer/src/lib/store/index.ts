import { startInterpreting, stopInterpreting } from "#lib/backend/index";
import { error, info } from "#lib/log/index";
import type { ConnectionMode } from "#lib/types/connection";
import type { ChargeStatus, MagStatus, TrackerModel } from "#lib/types/tracker";
import { DISCORD_URL, GITHUB_URL } from "#lib/util/consts.ts";
import { writable, type Writable } from "svelte/store";
import type { TrackerSettings } from "./settings";
import { trackerStore, updateTrackerStore } from "./tracker-storage";

export * from "./platform";
export * as settings from "./settings";

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
	sensorRssi?: number;
}

export type TrackerSave = Omit<Tracker, "data">;

export const connectedTrackers = writable<Tracker[]>([]);
export const knownTrackers = writable<TrackerSave[]>([]);

export const trackerOpenStates = writable<Record<string, boolean>>({});

// resolves once the saved trackers have been loaded into knownTrackers
export const trackersLoaded: Promise<void> = (async () => {
	try {
		try {
			const loaded = await (await trackerStore()).get("trackers");
			if (loaded && typeof loaded === "object") {
				// for every Tracker in loaded, place into knownTrackers
				knownTrackers.set(Object.values(loaded));
			}
			info(["store"], `Loaded ${Object.keys(loaded ?? {}).length} saved tracker records from trackers.json`);
		} catch (e) {
			error(["store"], `Failed to load settings from trackers.json: ${e}`);
		}
	} catch (e) {
		error(["store"], `Failed to load trackers.json: ${e}`);
	}
})();

export function saveTrackerConfig(tracker: TrackerSave): Promise<void> {
	return trackersLoaded
		.then(async () => {
			let changed = false;
			let changedFields: string[] = [];
			await updateTrackerStore<Record<string, TrackerSave>>("trackers", (current) => {
				const settings = current ?? {};
				const saved = settings[tracker.id];
				if (
					saved &&
					saved.name === tracker.name &&
					saved.connection_mode === tracker.connection_mode &&
					saved.tracker_type === tracker.tracker_type &&
					saved.bodyPart === tracker.bodyPart &&
					JSON.stringify(saved.settings ?? null) === JSON.stringify(tracker.settings ?? null)
				)
					return settings;

				changed = true;
				const previousCorrections = saved?.settings?.dynamicCalibration ?? [];
				const nextCorrections = tracker.settings?.dynamicCalibration ?? [];
				changedFields = !saved
					? ["new configuration"]
					: [
							...(saved.name !== tracker.name ? ["name"] : []),
							...(saved.connection_mode !== tracker.connection_mode ? ["connection_mode"] : []),
							...(saved.tracker_type !== tracker.tracker_type ? ["tracker_type"] : []),
							...(saved.bodyPart !== tracker.bodyPart ? ["bodyPart"] : []),
							...(saved.settings?.fps !== tracker.settings?.fps ? ["settings.fps"] : []),
							...(saved.settings?.mode !== tracker.settings?.mode ? ["settings.mode"] : []),
							...(JSON.stringify(previousCorrections) !== JSON.stringify(nextCorrections)
								? ["settings.dynamicCalibration"]
								: []),
							...(saved.settings?.emulatedFeet !== tracker.settings?.emulatedFeet
								? ["settings.emulatedFeet"]
								: []),
						];
				return { ...settings, [tracker.id]: tracker };
			});

			if (!changed) return;
			knownTrackers.update((trackers) => [...trackers.filter((saved) => saved.id !== tracker.id), tracker]);
			info(["store", "trackers"], `Saved tracker ${tracker.id} config changes: ${changedFields.join(", ")}`);
		})
		.catch((e) => {
			error(["store"], `Failed to save tracker ${tracker.id} to trackers.json: ${e}`);
		});
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
