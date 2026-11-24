import { z } from "zod";
import type { FPSMode, SensorAutoCorrection, SensorMode, TrackerModel } from "../renderer/src/lib/types/tracker";
import { DEFAULT_SOLARXR_ENDPOINT, DEFAULT_UDP_ENDPOINT, type SlimeVREndpoint } from "./slimevr-settings";

const trackerModel = z.custom<TrackerModel>(
	(value): value is TrackerModel => typeof value === "string" && ["X2", "Wireless", "Wired"].includes(value),
);
const fpsMode = z.custom<FPSMode>((value): value is FPSMode => value === 50 || value === 100);
const sensorMode = z.custom<SensorMode>((value): value is SensorMode => value === 1 || value === 2);
const sensorAutoCorrection = z.custom<SensorAutoCorrection>(
	(value): value is SensorAutoCorrection => typeof value === "string" && ["accel", "gyro", "mag"].includes(value),
);

const program = z
	.object({
		locale: z.string().catch("en-US"),
		theme: z.string().catch("default"),
		autoUpdate: z.boolean().catch(false),
		checkUpdatesApp: z.boolean().catch(true),
		checkUpdatesLanguage: z.boolean().catch(true),
		updateChannel: z.string().catch("stable"),
		autoStart: z.boolean().catch(false),
		autoOff: z.boolean().catch(false),
		visualization: z.boolean().catch(false),
		visualizationFPS: z.number().min(1).catch(10),
		preciseData: z.boolean().catch(false),
		fastData: z.boolean().catch(false),
	})
	.catch({
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

const endpoint = (defaults: SlimeVREndpoint) =>
	z
		.object({
			ip: z.string().trim().min(1).catch(defaults.ip),
			port: z.number().int().min(1).max(65535).catch(defaults.port),
		})
		.catch(() => ({ ...defaults }));

const solarxrEndpoint = endpoint(DEFAULT_SOLARXR_ENDPOINT);
const udpEndpoint = endpoint(DEFAULT_UDP_ENDPOINT);
export const slimevrSettingsSchema = z.preprocess(
	(value) => {
		if (!value || typeof value !== "object" || !("ip" in value || "port" in value)) return value;
		const { ip, port } = solarxrEndpoint.parse(value);
		const usesBroadcast = ip === DEFAULT_UDP_ENDPOINT.ip;
		const usesUdpPort = port === DEFAULT_UDP_ENDPOINT.port;
		return {
			solarxr: {
				ip: usesBroadcast ? DEFAULT_SOLARXR_ENDPOINT.ip : ip,
				port: usesUdpPort ? DEFAULT_SOLARXR_ENDPOINT.port : port,
			},
			udp: usesBroadcast || usesUdpPort ? value : DEFAULT_UDP_ENDPOINT,
		};
	},
	z
		.object({
			transport: z.enum(["auto", "solarxr", "udp"]).catch("auto"),
			solarxr: solarxrEndpoint,
			udp: udpEndpoint,
		})
		.catch(() => ({
			transport: "auto" as const,
			solarxr: { ...DEFAULT_SOLARXR_ENDPOINT },
			udp: { ...DEFAULT_UDP_ENDPOINT },
		})),
);

const connection = z
	.object({
		models: z.array(trackerModel).catch([]),
		modes: z.array(z.string()).catch([]),
		ports: z.array(z.string()).catch([]),
		slimevr: slimevrSettingsSchema,
	})
	.catch(() => ({ models: [], modes: [], ports: [], slimevr: slimevrSettingsSchema.parse(undefined) }));

const tracker = z
	.object({
		fps: fpsMode.catch(100 as FPSMode),
		mode: sensorMode.catch(2 as SensorMode),
		dynamicCalibration: z.array(sensorAutoCorrection).catch(["accel"] as SensorAutoCorrection[]),
		emulatedFeet: z.boolean().catch(false),
		heartbeat: z.number().min(0).catch(2000),
		buttonDebounce: z.number().min(0).catch(100),
	})
	.catch({
		fps: 100 as FPSMode,
		mode: 2 as SensorMode,
		dynamicCalibration: ["accel"] as SensorAutoCorrection[],
		emulatedFeet: false,
		heartbeat: 2000,
		buttonDebounce: 100,
	});

const advanced = z
	.object({
		showAllSerialPorts: z.boolean().catch(false),
		writeLogs: z.boolean().catch(true),
		loggingMode: z.enum(["minimal", "debug", "all"]).catch("minimal"),
	})
	.catch({ showAllSerialPorts: false, writeLogs: true, loggingMode: "minimal" });

export const settingsSchema = z.object({ program, connection, tracker, advanced }).catch({
	program: program.parse({}),
	connection: connection.parse({}),
	tracker: tracker.parse({}),
	advanced: advanced.parse({}),
});

export type AppSettings = z.infer<typeof settingsSchema>;
