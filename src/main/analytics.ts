import { PRIVALYTICS_ORIGIN } from "$shared/consts";
import type { AnalyticsPreview } from "$shared/ipc/channels";
import { app } from "electron";
import { randomUUID } from "node:crypto";
import { backendCalls } from "./backend";
import { info } from "./log";
import { getSetting, setSetting } from "./store";

const SETTINGS_FILE = "analytics.json";
const TRACKER_SETTLE_MS = 60_000;
const REPORT_URL = `${PRIVALYTICS_ORIGIN.replace(/\/$/, "")}/api/v1/projects/slimetora/report`;

type AnalyticsSettings = { enabled?: boolean; entityId?: string };
type SavedAppSettings = {
	settings?: { connection?: { models?: string[]; modes?: string[]; ports?: string[] } };
};
type ReportValues = { appVersion: string; trackerModel: string[]; connectionMode: string[] };

let reportRunning = false;
let trackerGateOpen = false;
let firstTrackerTimer: ReturnType<typeof setTimeout> | undefined;
let lastObservedSignature: string | undefined;
let lastReportedSignature: string | undefined;
let changedWhileReporting = false;

function settings(): AnalyticsSettings {
	return getSetting<AnalyticsSettings>(SETTINGS_FILE, { backupCorrupt: true }) ?? {};
}

function currentSetup(models?: string[], modes?: string[], ports?: string[]): AnalyticsPreview {
	const saved = getSetting<SavedAppSettings>("settings.json", { backupCorrupt: true });
	const connection = saved?.settings?.connection;
	const selectedModels = models ?? connection?.models ?? [];
	const selectedModes = modes ?? connection?.modes ?? [];
	const selectedPorts = ports ?? connection?.ports ?? []; // these aren't sent for analytics, but are used to determine the connectionMode values
	const snapshot = backendCalls.getSnapshot();

	const trackerModels = new Set<string>();
	let unresolvedTrackerModel = false;
	for (const selectedModel of selectedModels) {
		if (selectedModel === "X2") trackerModels.add("x2");
		else if (selectedModel === "Wireless") {
			const wirelessDevices = snapshot.devices.filter(
				(device) => device.model === "wireless" || device.model === "x2",
			);
			if (wirelessDevices.length === 0) unresolvedTrackerModel = true;
			for (const device of wirelessDevices) trackerModels.add(device.model);
		}
		else if (selectedModel === "Wired") {
			const wiredDevices = snapshot.devices.filter((device) => device.model === "wired");
			if (wiredDevices.length === 0) unresolvedTrackerModel = true;
			for (const device of wiredDevices) {
				if ("wiredModel" in device && typeof device.wiredModel === "string")
					trackerModels.add(device.wiredModel);
				else unresolvedTrackerModel = true;
			}
		} else unresolvedTrackerModel = true;
	}

	const connectionModes = new Set<string>();
	let unresolvedConnectionMode = false;
	for (const selectedMode of selectedModes) {
		if (selectedMode === "ble") {
			connectionModes.add("ble");
			continue;
		}
		if (selectedMode !== "serial") {
			unresolvedConnectionMode = true;
			continue;
		}

		const serialEndpoints = snapshot.endpoints.filter((endpoint) => selectedPorts.includes(endpoint.id));
		if (selectedPorts.length === 0 || serialEndpoints.length !== selectedPorts.length) {
			unresolvedConnectionMode = true;
			continue;
		}
		for (const endpoint of serialEndpoints) {
			if (endpoint.dongle === "GX6") connectionModes.add("gx6");
			else if (endpoint.dongle === "GX2") connectionModes.add("gx2");
			else if (endpoint.model === "wired") connectionModes.add("serial");
			else unresolvedConnectionMode = true;
		}
	}

	return {
		appVersion: app.getVersion(),
		...(!unresolvedTrackerModel && trackerModels.size > 0 ? { trackerModel: [...trackerModels].sort() } : {}),
		...(!unresolvedConnectionMode && connectionModes.size > 0
			? { connectionMode: [...connectionModes].sort() }
			: {}),
	};
}

function reportValues(): ReportValues | undefined {
	const setup = currentSetup();
	if (!setup.trackerModel || !setup.connectionMode) return;
	return {
		appVersion: setup.appVersion,
		trackerModel: setup.trackerModel,
		connectionMode: setup.connectionMode,
	};
}

function setupSignature(): string | undefined {
	const values = reportValues();
	return values ? JSON.stringify(values) : undefined;
}

async function reportAnalytics(): Promise<void> {
	if (reportRunning || !trackerGateOpen || settings().enabled === false) return;
	const values = reportValues();
	if (!values) return;
	const signature = JSON.stringify(values);
	if (signature === lastReportedSignature) return;

	reportRunning = true;
	let succeeded = false;
	try {
		const state = settings();
		if (state.enabled === false) return;
		const entityId = state.entityId ?? randomUUID();
		if (!state.entityId) setSetting(SETTINGS_FILE, { ...state, entityId });

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
		if (!succeeded) {
			changedWhileReporting = false;
			return;
		}
		if (changedWhileReporting) {
			changedWhileReporting = false;
			if (setupSignature() !== lastReportedSignature) void reportAnalytics();
		}
	}
}

export function getAnalyticsPreview(models: string[], modes: string[], ports: string[]): AnalyticsPreview {
	return currentSetup(models, modes, ports);
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
	noteAnalyticsSetupChanged();
}

export function noteAnalyticsConnectionStarted(): void {
	if (firstTrackerTimer) clearTimeout(firstTrackerTimer);
	firstTrackerTimer = undefined;
	trackerGateOpen = false;
	lastReportedSignature = undefined;
	lastObservedSignature = setupSignature();
	changedWhileReporting = false;
}

export function noteAnalyticsConnectionStopped(): void {
	if (firstTrackerTimer) clearTimeout(firstTrackerTimer);
	firstTrackerTimer = undefined;
	trackerGateOpen = false;
	changedWhileReporting = false;
}

export function noteAnalyticsSetupChanged(): void {
	const signature = setupSignature();
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
	return settings().enabled !== false;
}

export function setAnalyticsEnabled(enabled: boolean): void {
	const saved = settings();
	setSetting(SETTINGS_FILE, { ...saved, enabled });
	if (enabled && trackerGateOpen) void reportAnalytics();
}

export function startAnalyticsReporting(): void {
	lastObservedSignature = setupSignature();
}
