import { Channels, type PlatformBridge } from "$shared/ipc/channels";
import { contextBridge, ipcRenderer } from "electron";

const bridge: PlatformBridge = {
	getAppInfo: () => ipcRenderer.invoke(Channels.appInfo),
	getCapabilities: () => ipcRenderer.invoke(Channels.capabilities),
	log: (record) => ipcRenderer.send(Channels.log, record),
};

contextBridge.exposeInMainWorld("slimetora", bridge);
