import type {
	BodyPart,
	ConnectionKind,
	DeviceSnapshot,
	EndpointDescriptor,
	Events,
	TrackerModel,
	TrackerSettings,
} from "haritorax-interpreter";

// events the renderer receives; `log` goes to the log file instead, and `error` is sent as a plain message
export type BackendEventName = Exclude<keyof Events, "log">;

export type BackendEvents = {
	[E in BackendEventName]: E extends "error" ? { error: { message: string } } : Events[E];
};

export interface BackendEventMessage<E extends BackendEventName = BackendEventName> {
	event: E;
	payload: BackendEvents[E];
}

export const BACKEND_EVENTS = [
	"error",
	"devices",
	"endpoint:connected",
	"endpoint:disconnected",
	"device:connected",
	"device:disconnected",
	"tracker:connected",
	"tracker:disconnected",
	"imu",
	"battery",
	"mag",
	"tap",
	"accelAccuracy",
	"rssi",
	"info",
	"settings",
	"channel",
	"identified",
	"paired",
	"unpaired",
	"button",
] as const satisfies readonly BackendEventName[];

export type UserActionName = "ResetYaw" | "Reset" | "ResetMounting" | "PauseTracking";

export interface SessionOptions {
	modes: ConnectionKind[];
	models: TrackerModel[];
	ports: string[];
	bleSerials: string[];
	slimevr: { ip: string; port: number };
}

// calls the renderer can make into the main process, by name
export interface BackendCalls {
	startSession(options: SessionOptions): Promise<void>;
	stopSession(): Promise<void>;
	listSerialPorts(): Promise<string[]>;
	scanBlePreview(): Promise<EndpointDescriptor[]>;
	stopBlePreview(): Promise<void>;
	discover(): Promise<EndpointDescriptor[]>;
	stopDiscovery(): Promise<void>;
	getEndpoints(): EndpointDescriptor[];
	getDevices(): DeviceSnapshot[];
	connect(endpointId: string): Promise<void>;
	disconnect(endpointId: string): Promise<void>;
	setSettings(deviceId: string, settings: TrackerSettings): Promise<void>;
	setBodyPart(deviceId: string, bodyPart: BodyPart): Promise<void>;
	powerOff(deviceId: string): Promise<void>;
	switchCommunication(deviceId: string, mode: "ble" | "serial"): Promise<void>;
	getChannel(endpointId: string): number | undefined;
	setChannel(endpointId: string, channel: number): Promise<void>;
	pair(endpointId: string, slot: string): Promise<void>;
	unpair(endpointId: string, slot: string): Promise<void>;
	sendUserAction(deviceId: string, action: UserActionName): void;
	configure(settings: Record<string, unknown>): void;
}

export type BackendCallName = keyof BackendCalls;

export interface BackendBridge {
	invoke(command: string, args: unknown[]): Promise<unknown>;
	subscribe(handler: (message: BackendEventMessage) => void): void;
}
