import { Channels, type AppInfo } from "$shared/ipc/channels";
import { isLogRecord } from "$shared/log/index";
import { app, ipcMain, shell } from "electron";
import { getTransportCapabilities, registerBackendIpc } from "../backend";
import { configureLogging, logsDirectory, warn, writeRecord } from "../log";
import { deleteSetting, getSetting, setSetting } from "../store";
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

	registerBackendIpc();

	ipcMain.on(Channels.log, (_event, record: unknown) => {
		if (isLogRecord(record)) writeRecord(record);
		else warn("ipc", "Dropped malformed log record from renderer");
	});

	ipcMain.handle(Channels.settingGet, (_event, key: string) => getSetting(key, { backupCorrupt: true }));
	ipcMain.handle(Channels.settingSet, (_event, key: string, value: unknown) => {
		setSetting(key, value);
		if (key === "settings.json" && typeof value === "object" && value !== null) {
			configureLogging((value as { settings?: { advanced?: unknown } }).settings?.advanced);
		}
	});
	ipcMain.handle(Channels.settingDelete, (_event, key: string) => deleteSetting(key));
}
