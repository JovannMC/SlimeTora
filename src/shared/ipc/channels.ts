import type { BackendBridge } from "$shared/backend/contract";
import type { LogRecord } from "$shared/log/index";

export const Channels = {
	appInfo: "app:info",
	capabilities: "app:capabilities",
	log: "log:write",
	backendInvoke: "backend:invoke",
	backendEvent: "backend:event",
	openLogsFolder: "log:open-folder",
} as const;

export type ChannelName = (typeof Channels)[keyof typeof Channels];

export interface AppInfo {
	version: string;
	electronVersion: string;
	chromeVersion: string;
	nodeVersion: string;
	platform:
		| "aix"
		| "android"
		| "darwin"
		| "freebsd"
		| "haiku"
		| "linux"
		| "openbsd"
		| "sunos"
		| "win32"
		| "cygwin"
		| "netbsd";
	isPackaged: boolean;
}

export interface CapabilityStatus {
	available: boolean;
	reason?: "unsupported-platform" | "adapter-off" | "permission-missing" | "binding-failed";
}

export interface Capabilities {
	"bluetooth-le": CapabilityStatus;
	serial: CapabilityStatus;
}

// api exposed to renderer on `window.slimetora`
export interface PlatformBridge {
	getAppInfo(): Promise<AppInfo>;
	getCapabilities(): Promise<Capabilities>;
	log(record: LogRecord): void;
	backend: BackendBridge;
	openLogsFolder(): Promise<void>;
}
