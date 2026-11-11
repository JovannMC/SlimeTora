import type { BackendBridge } from "$shared/backend/contract";
import type { LogRecord } from "$shared/log/index";
import type { AppUpdate, LanguageData } from "$shared/updates";

export const Channels = {
	appInfo: "app:info",
	languagesGet: "updates:languages-get",
	languagesCheck: "updates:languages-check",
	appCheck: "updates:app-check",
	openRelease: "updates:open-release",
	capabilities: "app:capabilities",
	log: "log:write",
	backendInvoke: "backend:invoke",
	backendEvent: "backend:event",
	openLogsFolder: "log:open-folder",
	openDataFolder: "data:open-folder",
	customThemesGet: "themes:get-custom",
	openThemesFolder: "themes:open-folder",
	settingGet: "setting:get",
	settingSet: "setting:set",
	settingDelete: "setting:delete",
	analyticsGet: "analytics:get",
	analyticsSet: "analytics:set",
	analyticsPreviewGet: "analytics:preview-get",
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

export interface AnalyticsPreview {
	appVersion: string;
	operatingSystem: string;
	trackerCount: number;
	trackerModel?: string[];
	connectionMode?: string[];
}

export interface CustomTheme {
	id: string;
	name: string;
	css: string;
}

// api exposed to renderer on `window.slimetora`
export interface PlatformBridge {
	getAppInfo(): Promise<AppInfo>;
	getLanguages(): Promise<LanguageData>;
	checkLanguages(): Promise<number>;
	checkAppUpdate(channel: "stable" | "beta"): Promise<AppUpdate>;
	openRelease(url: string): Promise<void>;
	getCapabilities(): Promise<Capabilities>;
	log(record: LogRecord): void;
	backend: BackendBridge;
	openLogsFolder(): Promise<string>;
	openDataFolder(): Promise<string>;
	getCustomThemes(): Promise<CustomTheme[]>;
	getSetting<T = unknown>(key: string): Promise<T | undefined>;
	setSetting(key: string, value: unknown): Promise<void>;
	deleteSetting(key: string): Promise<void>;
	getAnalyticsEnabled(): Promise<boolean>;
	setAnalyticsEnabled(enabled: boolean): Promise<void>;
	getAnalyticsPreview(): Promise<AnalyticsPreview>;
}
