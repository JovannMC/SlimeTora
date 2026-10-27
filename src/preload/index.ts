import { Channels, type PlatformBridge } from "$shared/ipc/channels";
import { contextBridge, ipcRenderer } from "electron";

const bridge: PlatformBridge = {
	getAppInfo: () => ipcRenderer.invoke(Channels.appInfo),
	getCapabilities: () => ipcRenderer.invoke(Channels.capabilities),
};

contextBridge.exposeInMainWorld("slimetora", bridge);
