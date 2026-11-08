import { Channels, type PlatformBridge } from "$shared/ipc/channels";
import { contextBridge, ipcRenderer } from "electron";

const bridge: PlatformBridge = {
	getAppInfo: () => ipcRenderer.invoke(Channels.appInfo),

	getLanguages: () => ipcRenderer.invoke(Channels.languagesGet),
	checkLanguages: () => ipcRenderer.invoke(Channels.languagesCheck),
	checkAppUpdate: (channel) => ipcRenderer.invoke(Channels.appCheck, channel),
	openRelease: (url) => ipcRenderer.invoke(Channels.openRelease, url),

	getCapabilities: () => ipcRenderer.invoke(Channels.capabilities),
	log: (record) => ipcRenderer.send(Channels.log, record),
	openLogsFolder: () => ipcRenderer.invoke(Channels.openLogsFolder),
	openDataFolder: () => ipcRenderer.invoke(Channels.openDataFolder),
	getSetting: (key) => ipcRenderer.invoke(Channels.settingGet, key),
	setSetting: (key, value) => ipcRenderer.invoke(Channels.settingSet, key, value),
	deleteSetting: (key) => ipcRenderer.invoke(Channels.settingDelete, key),
	getAnalyticsEnabled: () => ipcRenderer.invoke(Channels.analyticsGet),
	setAnalyticsEnabled: (enabled) => ipcRenderer.invoke(Channels.analyticsSet, enabled),
	getAnalyticsPreview: (models, modes, ports) =>
		ipcRenderer.invoke(Channels.analyticsPreviewGet, models, modes, ports),

	backend: {
		invoke: (command, args) => ipcRenderer.invoke(Channels.backendInvoke, command, args),
		subscribe: (handler) => {
			ipcRenderer.on(Channels.backendEvent, (_event, message) => handler(message));
		},
	},
};

contextBridge.exposeInMainWorld("slimetora", bridge);
