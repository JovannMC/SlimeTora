import { Channels, type PlatformBridge } from "$shared/ipc/channels";
import { contextBridge, ipcRenderer } from "electron";

const bridge: PlatformBridge = {
	getAppInfo: () => ipcRenderer.invoke(Channels.appInfo),
	getCapabilities: () => ipcRenderer.invoke(Channels.capabilities),
	log: (record) => ipcRenderer.send(Channels.log, record),
	openLogsFolder: () => ipcRenderer.invoke(Channels.openLogsFolder),
	backend: {
		invoke: (command, args) => ipcRenderer.invoke(Channels.backendInvoke, command, args),
		subscribe: (handler) => {
			ipcRenderer.on(Channels.backendEvent, (_event, message) => handler(message));
		},
	},
};

contextBridge.exposeInMainWorld("slimetora", bridge);
