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

	ipcMain.handle(Channels.appInfo, () => getAppInfo());
	ipcMain.handle(Channels.languagesGet, () => getLanguages());
	ipcMain.handle(Channels.languagesCheck, () => checkLanguages());
	ipcMain.handle(Channels.appCheck, (_event, channel: unknown) => {
		if (channel !== "stable" && channel !== "beta") throw new Error("Invalid update channel");
		return checkApp(channel);
	});
	ipcMain.handle(Channels.openRelease, (_event, url: unknown) => {
		if (typeof url !== "string") throw new Error("Invalid URL");
		return openRelease(url);
	});

	ipcMain.handle(Channels.capabilities, getTransportCapabilities);
	ipcMain.handle(Channels.openLogsFolder, () => shell.openPath(logsDirectory()));
	ipcMain.handle(Channels.openDataFolder, () => shell.openPath(app.getPath("userData")));
	ipcMain.handle(Channels.customThemesGet, () => getCustomThemes());

	registerBackendIpc();

	ipcMain.on(Channels.log, (_event, record: unknown) => {
		if (isLogRecord(record)) writeRecord(record);
		else warn("ipc", "Dropped malformed log record from renderer");
	});

	ipcMain.handle(Channels.analyticsGet, () => getAnalyticsEnabled());
	ipcMain.handle(Channels.analyticsPreviewGet, () => getAnalyticsPreview());
	ipcMain.handle(Channels.analyticsSet, async (_event, enabled: unknown) => {
		if (typeof enabled !== "boolean") throw new Error("Invalid analytics preference");
		await setAnalyticsEnabled(enabled);
	});

	ipcMain.handle(Channels.settingGet, (_event, key: string) => {
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
	ipcMain.handle(Channels.settingSet, async (_event, key: string, value: unknown) => {
		if (key === "analytics.json") throw new Error("Analytics settings are private to the main process");
		await setSetting(key, value);
		if (key === "settings.json" && typeof value === "object" && value !== null) {
			configureLogging((value as { settings?: { advanced?: unknown } }).settings?.advanced);
			void noteAnalyticsSetupChanged().catch((err) =>
				warn(["analytics"], `Failed to update analytics after settings changed: ${String(err)}`),
			);
		}
	});
	ipcMain.handle(Channels.settingDelete, (_event, key: string) => {
		if (key === "analytics.json") throw new Error("Analytics settings are private to the main process");
		deleteSetting(key);
	});
}
