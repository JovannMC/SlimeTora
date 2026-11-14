import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";

const developmentOrigin = process.env.VITE_DEV_SERVER_URL ? new URL(process.env.VITE_DEV_SERVER_URL).origin : undefined;

export function assertTrustedIpcSender(event: IpcMainEvent | IpcMainInvokeEvent): void {
	const frame = event.senderFrame;
	if (!frame || frame !== event.sender.mainFrame) throw new Error("Untrusted IPC frame");

	let parsedUrl: URL;
	try {
		parsedUrl = new URL(frame.url);
	} catch {
		throw new Error("Invalid IPC sender URL");
	}

	const isPackagedRenderer = parsedUrl.protocol === "app:" && parsedUrl.hostname === "bundle" && !parsedUrl.port;
	if (!isPackagedRenderer && parsedUrl.origin !== developmentOrigin) throw new Error("Untrusted IPC origin");
}

export function handleIpc(channel: string, listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
	ipcMain.handle(channel, (event, ...args) => {
		assertTrustedIpcSender(event);
		return listener(event, ...args);
	});
}
