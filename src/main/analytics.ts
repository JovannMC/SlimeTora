import { PRIVALYTICS_ORIGIN } from "$shared/consts";
import type { AnalyticsPreview } from "$shared/ipc/channels";
import { app } from "electron";
import { randomUUID } from "node:crypto";
import si from "systeminformation";
import { backendCalls } from "./backend";
import { info } from "./log";
import { getSetting, setSetting } from "./store";

const SETTINGS_FILE = "analytics.json";
const TRACKER_SETTLE_MS = 60_000;
const REPORT_URL = `${PRIVALYTICS_ORIGIN.replace(/\/$/, "")}/api/v1/projects/slimetora/report`;

type AnalyticsSettings = { enabled?: boolean; entityId?: string };
type ReportValues = {
	appVersion: string;
	operatingSystem: string;
	trackerCount: number;
	trackerModel: string[];
	connectionMode: string[];
};

let reportRunning = false;
let trackerGateOpen = false;
let firstTrackerTimer: ReturnType<typeof setTimeout> | undefined;
let lastObservedSignature: string | undefined;
let lastReportedSignature: string | undefined;
let changedWhileReporting = false;

function settings(): AnalyticsSettings {
	return getSetting<AnalyticsSettings>(SETTINGS_FILE, { backupCorrupt: true }) ?? {};
}

async function operatingSystem(): Promise<string> {
	const info = await si.osInfo();
	if (info.platform === "win32") return info.distro.match(/Windows\s+\d+(?:\.\d+)?/i)?.[0] ?? info.distro;
	if (info.platform === "darwin") return `macOS ${info.release}`;
	if (info.platform === "linux") return `${info.distro} ${info.release}`;
	return info.distro || info.platform;
}

async function connectedSetup(): Promise<AnalyticsPreview> {
	const snapshot = backendCalls.getSnapshot();
	const connectedDevices = snapshot.devices.filter((device) => device.trackers.some((tracker) => tracker.connected));
	const trackerModels = new Set<string>();
	const connectionModes = new Set<string>();

	for (const device of connectedDevices) {
		if (device.model === "wired") {
			if (device.wiredModel) trackerModels.add(device.wiredModel);
		} else trackerModels.add(device.model);

		const endpoint = snapshot.endpoints.find((item) => item.id === device.endpointId);
		if (endpoint?.dongle === "GX6") connectionModes.add("gx6");
		else if (endpoint?.dongle === "GX2") connectionModes.add("gx2");
		else if (device.connection === "ble") connectionModes.add("ble");
		else if (device.model === "wired") connectionModes.add("serial");
	}

	return {
		appVersion: app.getVersion(),
		operatingSystem: await operatingSystem(),
		trackerCount: connectedDevices.reduce(
			(count, device) => count + device.trackers.filter((tracker) => tracker.connected).length,
			0,
		),
		...(trackerModels.size ? { trackerModel: [...trackerModels].sort() } : {}),
		...(connectionModes.size ? { connectionMode: [...connectionModes].sort() } : {}),
	};
}

async function reportValues(): Promise<ReportValues | undefined> {
	const setup = await connectedSetup();
	if (!setup.trackerModel || !setup.connectionMode) return;
	return {
		appVersion: setup.appVersion,
		operatingSystem: setup.operatingSystem,
		trackerCount: setup.trackerCount,
		trackerModel: setup.trackerModel,
		connectionMode: setup.connectionMode,
	};
}

async function setupSignature(): Promise<string | undefined> {
	const values = await reportValues();
	return values ? JSON.stringify(values) : undefined;
}

async function reportAnalytics(): Promise<void> {
	if (reportRunning || !trackerGateOpen) return;
	reportRunning = true;
	let succeeded = false;
	try {
		const state = settings();
		if (state.enabled === false) return;
		const values = await reportValues();
		if (!values) return;

		const signature = JSON.stringify(values);
		if (signature === lastReportedSignature) return;

		const entityId = state.entityId ?? randomUUID();
		if (!state.entityId) await setSetting(SETTINGS_FILE, { ...state, entityId });

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5_000);
		try {
			const response = await fetch(REPORT_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ entityId, values }),
				signal: controller.signal,
			});
			if (!response.ok) {
				info(["analytics"], `Analytics report returned HTTP ${response.status}`);
				return;
			}
			succeeded = true;
			lastReportedSignature = signature;
		} finally {
			clearTimeout(timeout);
		}
	} catch (err) {
		info(["analytics"], `Analytics report skipped: ${String(err)}`);
	} finally {
		reportRunning = false;
		if (changedWhileReporting) {
			changedWhileReporting = false;
			if (succeeded) {
				try {
					if ((await setupSignature()) !== lastReportedSignature) void reportAnalytics();
				} catch (err) {
					info(["analytics"], `Could not refresh analytics setup after reporting: ${String(err)}`);
				}
			}
		}
	}
}

export async function getAnalyticsPreview(): Promise<AnalyticsPreview> {
	return connectedSetup();
}

export function noteTrackerConnected(): void {
	if (firstTrackerTimer) return;
	if (!trackerGateOpen) {
		firstTrackerTimer = setTimeout(() => {
			trackerGateOpen = true;
			firstTrackerTimer = undefined;
			void reportAnalytics();
		}, TRACKER_SETTLE_MS);
		firstTrackerTimer.unref();
		return;
	}
	void noteAnalyticsSetupChanged().catch((err) =>
		info(["analytics"], `Could not observe tracker setup change: ${String(err)}`),
	);
}

export async function noteAnalyticsConnectionStarted(): Promise<void> {
	if (firstTrackerTimer) clearTimeout(firstTrackerTimer);
	firstTrackerTimer = undefined;
	trackerGateOpen = false;
	lastReportedSignature = undefined;
	lastObservedSignature = await setupSignature();
	changedWhileReporting = false;
}

export function noteAnalyticsConnectionStopped(): void {
	if (firstTrackerTimer) clearTimeout(firstTrackerTimer);
	firstTrackerTimer = undefined;
	trackerGateOpen = false;
	changedWhileReporting = false;
}

export async function noteAnalyticsSetupChanged(): Promise<void> {
	const signature = await setupSignature();
	if (signature === lastObservedSignature) return;
	lastObservedSignature = signature;
	if (!trackerGateOpen || !signature || signature === lastReportedSignature || settings().enabled === false) return;
	if (reportRunning) {
		changedWhileReporting = true;
		return;
	}
	void reportAnalytics();
}

export function getAnalyticsEnabled(): boolean {
	try {
		return settings().enabled !== false;
	} catch (err) {
		info(["analytics"], `Could not read analytics preference: ${String(err)}`);
		return true;
	}
}

export async function setAnalyticsEnabled(enabled: boolean): Promise<void> {
	const saved = settings();
	const wasEnabled = saved.enabled !== false;
	if (wasEnabled === enabled) return;

	await setSetting(SETTINGS_FILE, { ...saved, enabled });
	info(["settings", "analytics"], `Analytics changed from ${wasEnabled} to ${enabled}`);
	if (enabled && trackerGateOpen) void reportAnalytics();
}

export async function startAnalyticsReporting(): Promise<void> {
	lastObservedSignature = await setupSignature();
}
