import { Channels, type AppInfo, type Capabilities } from "$shared/ipc/channels";
import { isLogRecord } from "$shared/log/index";
import { app, ipcMain } from "electron";
import { warn, writeRecord } from "../log";

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

function getCapabilities(): Capabilities {
	// temporary stuff
	return {
		"bluetooth-le": { available: false, reason: "binding-failed" },
		serial: { available: false, reason: "binding-failed" },
	};
}

export function registerIpcHandlers(): void {
	ipcMain.handle(Channels.appInfo, () => getAppInfo());
	ipcMain.handle(Channels.capabilities, () => getCapabilities());
	ipcMain.on(Channels.log, (_event, record: unknown) => {
		if (isLogRecord(record)) writeRecord(record);
		else warn("ipc", "Dropped malformed log record from renderer");
	});
}
