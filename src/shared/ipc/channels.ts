export const Channels = {
	appInfo: "app:info",
	capabilities: "app:capabilities",
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
}
