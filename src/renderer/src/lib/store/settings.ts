import { load, type Store } from "#lib/api/store";
import { error, info } from "#lib/log/index";
import { FPSMode, SensorAutoCorrection, SensorMode, TrackerModel } from "#lib/types/tracker";
import type { CustomTheme } from "$shared/ipc/channels";
import { derived, get, writable } from "svelte/store";

export type LoggingMode = "minimal" | "debug" | "all";

export type ProgramSettings = {
	locale: string;
	theme: string;
	autoUpdate: boolean;
	checkUpdatesApp: boolean;
	checkUpdatesLanguage: boolean;
	updateChannel: string;
	autoStart: boolean;
	autoOff: boolean;
	visualization: boolean;
	visualizationFPS: number;
	preciseData: boolean;
	fastData: boolean;
};

export type ConnectionSettings = {
	models: TrackerModel[];
	modes: string[];
	ports: string[]; // for serial
	slimevr: {
		ip: string;
		port: number;
	};
};

export type TrackerSettings = {
	fps: FPSMode;
	mode: SensorMode;
	dynamicCalibration: SensorAutoCorrection[];
	emulatedFeet: boolean;
	heartbeat: number;
	buttonDebounce: number;
};

export type AdvancedSettings = {
	showAllSerialPorts: boolean;
	writeLogs: boolean;
	loggingMode: LoggingMode;
};

type SavedSettings = {
	program: ProgramSettings;
	connection: ConnectionSettings;
	tracker: TrackerSettings;
	advanced: AdvancedSettings;
};

export type SettingsFileError = { kind: "load" | "save"; detail: string; id: number };

export const program = writable<ProgramSettings>({
	locale: "en-US",
	theme: "default",
	autoUpdate: false,
	checkUpdatesApp: true,
	checkUpdatesLanguage: true,
	updateChannel: "stable",
	autoStart: false,
	autoOff: false,
	visualization: false,
	visualizationFPS: 10,
	preciseData: false,
	fastData: false,
});

export const connection = writable<ConnectionSettings>({
	models: [],
	modes: [],
	ports: [],
	slimevr: {
		ip: "255.255.255.255",
		port: 6969,
	},
});

export const tracker = writable<TrackerSettings>({
	fps: 100,
	mode: 2,
	dynamicCalibration: [SensorAutoCorrection.Accel],
	emulatedFeet: false,
	heartbeat: 2000,
	buttonDebounce: 100,
});

export const advanced = writable<AdvancedSettings>({
	showAllSerialPorts: false,
	writeLogs: true,
	loggingMode: "minimal",
});

export const restartRequired = writable(false);
export const firstRun = writable(false);
export const settingsFileErrors = writable<SettingsFileError[]>([]);
export const customThemes = writable<CustomTheme[]>([]);

let config: Store | undefined;
let hydrationComplete = false;
let writing = false;
let pendingSettings: SavedSettings | undefined;
let errorSequence = 0;
let latestSaveError = "";
let previousSettings: SavedSettings | undefined;
let settingsChangeTimer: ReturnType<typeof setTimeout> | undefined;
const pendingSettingChanges = new Map<string, { before: unknown; after: unknown }>();

type SettingChange = { path: string; before: unknown; after: unknown };

function changedSettingValues(before: unknown, after: unknown, parent = ""): SettingChange[] {
	if (JSON.stringify(before) === JSON.stringify(after)) return [];
	if (
		typeof before !== "object" ||
		before === null ||
		Array.isArray(before) ||
		typeof after !== "object" ||
		after === null ||
		Array.isArray(after)
	) {
		return parent ? [{ path: parent, before, after }] : [];
	}

	const changes: SettingChange[] = [];
	for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
		changes.push(
			...changedSettingValues(
				(before as Record<string, unknown>)[key],
				(after as Record<string, unknown>)[key],
				parent ? `${parent}.${key}` : key,
			),
		);
	}
	return changes;
}

function formatSettingValue(value: unknown): string {
	if (value === undefined) return "unset";
	return JSON.stringify(value) ?? String(value);
}

function logSettingChanges(changes: SettingChange[]): void {
	for (const change of changes) {
		const previous = pendingSettingChanges.get(change.path);
		pendingSettingChanges.set(change.path, {
			before: previous ? previous.before : change.before,
			after: change.after,
		});
	}
	if (settingsChangeTimer) clearTimeout(settingsChangeTimer);

	settingsChangeTimer = setTimeout(() => {
		const changed = [...pendingSettingChanges.entries()].sort(([left], [right]) => left.localeCompare(right));
		pendingSettingChanges.clear();
		settingsChangeTimer = undefined;

		const themeChange = changed.find(([path]) => path === "program.theme");
		if (themeChange && JSON.stringify(themeChange[1].before) !== JSON.stringify(themeChange[1].after)) {
			info(
				["settings", "theme"],
				`Theme changed from ${formatSettingValue(themeChange[1].before)} to ${formatSettingValue(themeChange[1].after)}`,
			);
		}

		const otherChanges = changed
			.filter(
				([path, change]) =>
					path !== "program.theme" && JSON.stringify(change.before) !== JSON.stringify(change.after),
			)
			.map(
				([path, change]) =>
					`${path}: ${formatSettingValue(change.before)} -> ${formatSettingValue(change.after)}`,
			);
		if (otherChanges.length > 0) info(["settings", "changed"], `Updated settings: ${otherChanges.join(", ")}`);
	}, 300);
}

function currentSettings(): SavedSettings {
	return {
		program: get(program),
		connection: get(connection),
		tracker: get(tracker),
		advanced: get(advanced),
	};
}

function reportFileError(kind: SettingsFileError["kind"], detail: string): void {
	if (kind === "save" && detail === latestSaveError) return;
	if (kind === "save") latestSaveError = detail;
	error(["store", "settings"], `Failed to ${kind === "load" ? "load" : "save"} settings: ${detail}`);
	settingsFileErrors.update((items) => [...items.slice(-3), { kind, detail, id: ++errorSequence }]);
}

function scheduleSave(settings: SavedSettings): void {
	if (!config || get(firstRun)) return;
	pendingSettings = settings;
	if (writing) return;
	writing = true;
	void (async () => {
		try {
			while (pendingSettings && config) {
				const latest = pendingSettings;
				pendingSettings = undefined;
				await config.set("settings", latest);
				latestSaveError = "";
			}
		} catch (err) {
			reportFileError("save", String(err));
		} finally {
			writing = false;
		}
	})();
}

export const settingsLoaded = (async () => {
	try {
		config = await load("settings.json");
		const loaded = await config.get<Partial<SavedSettings>>("settings");
		firstRun.set(loaded === undefined);
		if (loaded && typeof loaded === "object") {
			if (loaded.program) program.set({ ...get(program), ...loaded.program });
			if (loaded.connection)
				connection.set({
					...get(connection),
					...loaded.connection,
					slimevr: { ...get(connection).slimevr, ...loaded.connection.slimevr },
				});
			if (loaded.tracker) tracker.set({ ...get(tracker), ...loaded.tracker });
			if (loaded.advanced) advanced.set({ ...get(advanced), ...loaded.advanced });
		}
		info(["store", "settings"], "Loaded settings from settings.json");
	} catch (err) {
		firstRun.set(Boolean(config));
		reportFileError("load", String(err));
	} finally {
		hydrationComplete = true;
	}

	if (config && !get(firstRun)) scheduleSave(currentSettings());
})();

export async function completeFirstRun(): Promise<void> {
	await settingsLoaded;
	if (!config || !get(firstRun)) return;

	try {
		const initialSettings = currentSettings();
		await config.set("settings", initialSettings);
		firstRun.set(false);
		info(["settings"], "Initial settings configured");
		info(["settings", "theme"], `Initial theme selected: ${initialSettings.program.theme}`);
		scheduleSave(currentSettings());
	} catch (err) {
		reportFileError("save", String(err));
		throw err;
	}
}

derived([program, connection, tracker, advanced], ([$program, $connection, $tracker, $advanced]): SavedSettings => ({
	program: $program,
	connection: $connection,
	tracker: $tracker,
	advanced: $advanced,
})).subscribe((settings) => {
	if (!hydrationComplete || get(firstRun)) {
		previousSettings = structuredClone(settings);
		return;
	}
	if (previousSettings) {
		const changed = changedSettingValues(previousSettings, settings);
		if (changed.length > 0) logSettingChanges(changed);
	}
	previousSettings = structuredClone(settings);
	scheduleSave(settings);
});
