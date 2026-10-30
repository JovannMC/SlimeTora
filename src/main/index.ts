import { app, BrowserWindow } from "electron";
import { disposeBackend } from "./backend";
import { registerIpcHandlers } from "./ipc/contract";
import { closeLogFile, error } from "./log";
import { createMainWindow, registerAppScheme, serveRenderer } from "./window";

app.setName("SlimeTora");

registerAppScheme();

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
	error("main", "Another instance is already running, quitting");
	app.quit();
}

let mainWindow: BrowserWindow | undefined;

app.on("second-instance", () => {
	if (!mainWindow) return;
	if (mainWindow.isMinimized()) mainWindow.restore();
	mainWindow.focus();
});

void app.whenReady().then(() => {
	if (process.env.VITE_DEV_SERVER_URL === undefined) serveRenderer();

	registerIpcHandlers();
	mainWindow = createMainWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

let quitting = false;
app.on("before-quit", (event) => {
	if (quitting) return;
	event.preventDefault();
	quitting = true;
	void disposeBackend()
		.catch((err) => error("main", "Failed to shut down backend:", err))
		.finally(() => {
			closeLogFile();
			app.quit();
		});
});
