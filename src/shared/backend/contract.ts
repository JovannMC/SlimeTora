import type {
	BodyPart,
	ConnectionKind,
	DeviceSnapshot,
	EndpointDescriptor,
	Events,
	TrackerModel,
	TrackerSettings,
} from "haritorax-interpreter";

type InterpreterEventName = Exclude<keyof Events, "log">;
export type BackendEventName = InterpreterEventName | "session" | "snapshot";

export type BackendEvents = {
	[E in InterpreterEventName]: E extends "error" ? { error: { message: string } } : Events[E];
} & { session: SessionState; snapshot: BackendSnapshot };

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
] as const satisfies readonly InterpreterEventName[];

export type UserActionName = "ResetYaw" | "Reset" | "ResetMounting" | "PauseTracking";

export interface SessionState {
	status: "off" | "starting" | "on" | "stopping" | "error";
	requestedEnabled: boolean;
	revision: number;
	error?: string;
}

export interface BackendSnapshot {
	revision: number;
	endpoints: EndpointDescriptor[];
	previewEndpoints: EndpointDescriptor[];
	connectedEndpointIds: string[];
	devices: DeviceSnapshot[];
	dongleSlots: Record<string, Record<string, "paired" | "unpaired">>;
	dongleChannels: Record<string, number>;
}

export interface SessionOptions {
	modes: ConnectionKind[];
	models: TrackerModel[];
	ports: string[];
	bleSerials: string[];
	heartbeatIntervalMs: number;
	buttonDebounceMs: number;
	slimevr: { ip: string; port: number };
}

// calls the renderer can make into the main process, by name
export interface BackendCalls {
	startSession(options: SessionOptions): Promise<void>;
	stopSession(): Promise<void>;
	getSessionState(): SessionState;
	getSnapshot(): BackendSnapshot;
	updateBleTargets(serials: string[]): void;
	forgetBleTarget(serial: string): Promise<void>;
	listSerialPorts(): Promise<string[]>;
	scanBlePreview(): Promise<EndpointDescriptor[]>;
	stopBlePreview(): Promise<void>;
	discover(): Promise<EndpointDescriptor[]>;
	stopDiscovery(): Promise<void>;
	connect(endpointId: string): Promise<void>;
	disconnect(endpointId: string): Promise<void>;
	setSettings(deviceId: string, settings: TrackerSettings): Promise<void>;
	setBodyPart(deviceId: string, bodyPart: BodyPart): Promise<void>;
	powerOff(deviceId: string): Promise<void>;
	switchCommunication(deviceId: string, mode: "ble" | "serial"): Promise<void>;
	setChannel(endpointId: string, channel: number): Promise<void>;
	pair(endpointId: string, slot: string): Promise<void>;
	unpair(endpointId: string, slot: string): Promise<void>;
	sendUserAction(deviceId: string, action: UserActionName): void;
}

export type BackendCallName = keyof BackendCalls;

export interface BackendBridge {
	invoke(command: string, args: unknown[]): Promise<unknown>;
	subscribe(handler: (message: BackendEventMessage) => void): void;
}
