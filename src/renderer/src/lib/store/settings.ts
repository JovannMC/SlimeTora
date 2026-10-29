import { load, type Store } from "#lib/api/store";
import { isOn, trackersLoaded } from "#lib/store/index";
import { error, info } from "#lib/log/index";
import { FPSMode, SensorAutoCorrection, SensorMode, TrackerModel } from "#lib/types/tracker";
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
		config = await load("settings.json", { autoSave: true });
		const loaded = await config.get<SavedSettings>("settings");

		if (loaded && typeof loaded === "object") {
			if (loaded.program) program.set(loaded.program);
			if (loaded.connection) connection.set(loaded.connection);
			if (loaded.tracker) tracker.set(loaded.tracker);
			if (loaded.advanced) advanced.set(loaded.advanced);
		}
		info(["store", "settings"], `Loaded settings from settings.json: ${JSON.stringify(loaded, null, 2)}`);

		if (loaded?.program?.autoStart) {
			void trackersLoaded.then(() => isOn.set(true));
		}
	} catch (e) {
		error(["store", "settings"], `Failed to load settings from settings.json: ${e}`);
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
		error(["store", "settings"], `Failed to save settings: ${e}`);
	}
});
