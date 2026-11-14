import { app, BrowserWindow } from "electron";
import { startAnalyticsReporting } from "./analytics";
import { disposeBackend } from "./backend";
import { registerIpcHandlers } from "./ipc/contract";
import { closeLogFile, error } from "./log";
import { flushPendingSettings } from "./store";
import { createMainWindow, registerAppScheme, serveRenderer } from "./window";

app.setName("SlimeTora");
app.commandLine.appendSwitch("force_low_power_gpu");

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
	void startAnalyticsReporting().catch((err) =>
		error(["analytics"], `Could not initialize analytics reporting: ${String(err)}`),
	);
	mainWindow = createMainWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});

let quitting = false;
const SHUTDOWN_TIMEOUT_MS = 15_000;
let shutdownTimedOut = false;
app.on("before-quit", (event) => {
	if (quitting) return;
	event.preventDefault();
	quitting = true;
	const shutdownTimeout = setTimeout(() => {
		shutdownTimedOut = true;
		error("main", `Backend shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms, forcing application exit`);
		void closeLogFile();
		setTimeout(() => app.exit(1), 1_000);
	}, SHUTDOWN_TIMEOUT_MS);

	void disposeBackend()
		.catch((err) => error("main", `Failed to shut down backend: ${String(err)}`))
		.then(async () => {
			if (shutdownTimedOut) return;
			clearTimeout(shutdownTimeout);
			try {
				await flushPendingSettings();
			} catch (err) {
				error("main", `Failed to flush pending settings: ${String(err)}`);
			}

			const flushTimeout = setTimeout(() => {
				error("main", "Log flush timed out after 2 seconds, forcing application exit");
				app.exit(1);
			}, 2_000);

			await closeLogFile();
			clearTimeout(flushTimeout);
			app.quit();
		});
});
