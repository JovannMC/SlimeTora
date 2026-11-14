import { Channels, type AppInfo } from "$shared/ipc/channels";
import { isLogRecord } from "$shared/log/index";
import { settingsSchema } from "$shared/settings-schema";
import { app, ipcMain, shell } from "electron";
import { isDeepStrictEqual } from "node:util";
import { getAnalyticsEnabled, getAnalyticsPreview, noteAnalyticsSetupChanged, setAnalyticsEnabled } from "../analytics";
import { getTransportCapabilities, registerBackendIpc } from "../backend";
import { getCustomThemes } from "../custom-themes";
import { configureLogging, logsDirectory, warn, writeRecord } from "../log";
import { backupSetting, deleteSetting, getSetting, setSetting } from "../store";
import { checkApp, checkLanguages, getLanguages, openRelease } from "../updates";
import { assertTrustedIpcSender, handleIpc } from "./security";

function getAppInfo(): AppInfo {
	return {
		version: app.getVersion(),
		electronVersion: process.versions.electron,
		chromeVersion: process.versions.chrome,
		nodeVersion: process.versions.node,
		platform: process.platform,
		isPackaged: app.isPackaged,
	};
}

export function registerIpcHandlers(): void {
	try {
		const saved = getSetting<{ settings?: { advanced?: unknown } }>("settings.json");
		configureLogging(saved?.settings?.advanced);
	} catch (err) {
		warn(["store"], `Could not load settings for logging configuration: ${String(err)}`);
		configureLogging(undefined);
	}

	handleIpc(Channels.appInfo, () => getAppInfo());
	handleIpc(Channels.languagesGet, () => getLanguages());
	handleIpc(Channels.languagesCheck, () => checkLanguages());
	handleIpc(Channels.appCheck, (_event, channel: unknown) => {
		if (channel !== "stable" && channel !== "beta") throw new Error("Invalid update channel");
		return checkApp(channel);
	});
	handleIpc(Channels.openRelease, (_event, url: unknown) => {
		if (typeof url !== "string") throw new Error("Invalid URL");
		return openRelease(url);
	});

	handleIpc(Channels.capabilities, getTransportCapabilities);
	handleIpc(Channels.openLogsFolder, () => shell.openPath(logsDirectory()));
	handleIpc(Channels.openDataFolder, () => shell.openPath(app.getPath("userData")));
	handleIpc(Channels.customThemesGet, () => getCustomThemes());

	registerBackendIpc();

	ipcMain.on(Channels.log, (event, record: unknown) => {
		try {
			assertTrustedIpcSender(event);
		} catch {
			warn("ipc", "Dropped log record from an untrusted renderer frame");
			return;
		}
		if (isLogRecord(record)) writeRecord(record);
		else warn("ipc", "Dropped malformed log record from renderer");
	});

	handleIpc(Channels.analyticsGet, () => getAnalyticsEnabled());
	handleIpc(Channels.analyticsPreviewGet, () => getAnalyticsPreview());
	handleIpc(Channels.analyticsSet, async (_event, enabled: unknown) => {
		if (typeof enabled !== "boolean") throw new Error("Invalid analytics preference");
		await setAnalyticsEnabled(enabled);
	});

	handleIpc(Channels.settingGet, (_event, key: unknown) => {
		if (typeof key !== "string") throw new Error("Invalid setting key");
		if (key === "analytics.json") throw new Error("Analytics settings are private to the main process");
		const saved = getSetting<Record<string, unknown>>(key, { backupCorrupt: true });
		if (key === "settings.json" && saved !== undefined) {
			const originalSettings = saved.settings;
			const normalized = settingsSchema.parse(originalSettings);
			if (!isDeepStrictEqual(normalized, originalSettings)) {
				try {
					const backup = backupSetting(key);
					warn(["store", "settings"], `Invalid settings were preserved as ${backup}`);
				} catch (err) {
					throw new Error(`Invalid settings could not be backed up: ${String(err)}`, { cause: err });
				}
			}
		}
		return saved;
	});
	handleIpc(Channels.settingSet, async (_event, key: unknown, value: unknown) => {
		if (typeof key !== "string") throw new Error("Invalid setting key");
		if (key === "analytics.json") throw new Error("Analytics settings are private to the main process");
		await setSetting(key, value);
		if (key === "settings.json" && typeof value === "object" && value !== null) {
			configureLogging((value as { settings?: { advanced?: unknown } }).settings?.advanced);
			void noteAnalyticsSetupChanged().catch((err) =>
				warn(["analytics"], `Failed to update analytics after settings changed: ${String(err)}`),
			);
		}
	});
	handleIpc(Channels.settingDelete, (_event, key: unknown) => {
		if (typeof key !== "string") throw new Error("Invalid setting key");
		if (key === "analytics.json") throw new Error("Analytics settings are private to the main process");
		deleteSetting(key);
	});
}
