import { load, type Store } from "#lib/api/store.js";
import { error, info } from "#lib/log/index.js";
import { FPSMode, SensorAutoCorrection, SensorMode, TrackerModel } from "#lib/types/tracker.js";
import { derived, writable } from "svelte/store";

export type LoggingMode = "minimal" | "debug" | "all";

export type ProgramSettings = {
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
	macAddresses?: string[]; // for BLE
	slimevrIP: string;
	slimevrPort: number;
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
	bypassSerialLimit: boolean;
	writeLogs: boolean;
	loggingMode: LoggingMode;
};

type SavedSettings = {
	program: ProgramSettings;
	connection: ConnectionSettings;
	tracker: TrackerSettings;
	advanced: AdvancedSettings;
};

export const program = writable<ProgramSettings>({
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
	macAddresses: [],
	slimevrIP: "255.255.255.255",
	slimevrPort: 6969,
});

export const tracker = writable<TrackerSettings>({
	fps: 100,
	mode: 2,
	dynamicCalibration: [SensorAutoCorrection.Accel],
	emulatedFeet: false,
	heartbeat: 2000,
	buttonDebounce: 500,
});

export const advanced = writable<AdvancedSettings>({
	bypassSerialLimit: false,
	writeLogs: true,
	loggingMode: "minimal",
});

// only set once the config file is loaded, so nothing is saved before the stored settings are applied
let config: Store | undefined;

(async () => {
	try {
		config = await load("config.json", { autoSave: true });
		const loaded = await config.get<SavedSettings>("settings");

		if (loaded && typeof loaded === "object") {
			if (loaded.program) program.set(loaded.program);
			if (loaded.connection) connection.set(loaded.connection);
			if (loaded.tracker) tracker.set(loaded.tracker);
			if (loaded.advanced) advanced.set(loaded.advanced);
		}
		info(`Loaded settings from config.json: ${JSON.stringify(loaded, null, 2)}`);
	} catch (e) {
		error(`Failed to load settings from config.json: ${e}`);
	}
})();

// save the whole settings object whenever any of the stores change
derived([program, connection, tracker, advanced], ([$program, $connection, $tracker, $advanced]): SavedSettings => ({
	program: $program,
	connection: $connection,
	tracker: $tracker,
	advanced: $advanced,
})).subscribe(async (settings) => {
	if (!config) return;

	try {
		await config.set("settings", settings);
		await config.save();
	} catch (e) {
		error(`Failed to save settings: ${e}`);
	}
});
