<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { untrack } from "svelte";
	import { onMount } from "svelte";
	import Icon from "@iconify/svelte";
	import { invoke } from "#lib/api/backend";
	import { backendSnapshot } from "#lib/backend/state";
	import { expectTrackerPowerOff } from "#lib/backend/notifications";
	import type { BackendSnapshot } from "$shared/backend/contract";
	import { error, info } from "#lib/log/index";
	import { ToastManager } from "#lib/util/toast.svelte";
	import { t } from "#lib/lang/index";
	import { connectedTrackers, saveTrackerConfig, type Tracker } from "#lib/store/index";
	import { ConnectionMode } from "#lib/types/connection";
	import { SensorAutoCorrection as LocalAutoCorrection } from "#lib/types/tracker";
	import type { TrackerSettings as DeviceSettings } from "haritorax-interpreter";
	import Button from "#lib/components/settings/Button.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import Switch from "#lib/components/settings/Switch.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";

	const trackerId = $derived(page.url.searchParams.get("trackerId"));
	let trackerData: Tracker | undefined = $state();

	// look the tracker up once per id, and go back to the list if it can't be found
	$effect(() => {
		const id = trackerId;
		if (!id) {
			error(["trackers", "settings"], "Tracker ID is undefined, redirecting to home page.");
			goto("/");
			return;
		}

		const found = untrack(() => $connectedTrackers.find((t) => t.id === id));
		trackerData = found;
		if (!found) {
			error(["trackers", "settings"], `Tracker with ID ${id} not found, redirecting to home page.`);
			goto("/");
			return;
		}

		const settings = untrack(() => settingsFor(found));
		fps = String(settings.fpsMode);
		sensorMode = String(settings.sensorMode);
		accelerometer = settings.sensorAutoCorrection.includes("accel");
		gyroscope = settings.sensorAutoCorrection.includes("gyro");
		magnetometer = settings.sensorAutoCorrection.includes("mag");
		emulatedFeet = found.settings?.emulatedFeet ?? false;
	});

	let fps = $state("50");
	let sensorMode = $state("2");
	let accelerometer = $state(true);
	let gyroscope = $state(false);
	let magnetometer = $state(false);
	let emulatedFeet = $state(false);
	let saving = $state(false);

	let latency: number | undefined = $state();
	let liveSnapshot: BackendSnapshot | undefined = $state();
	let refreshingStats = false;
	let autoLoadedId: string | undefined;
	const deviceSnapshot = $derived(
		$backendSnapshot.devices.find(
			(device) => device.deviceId === (trackerData ? trackerDeviceId(trackerData.id) : ""),
		),
	);
	const trackerSnapshot = $derived(deviceSnapshot?.trackers.find((item) => item.trackerId === trackerData?.id));
	const liveTracker = $derived(
		liveSnapshot?.devices
			.find((device) => device.deviceId === (trackerData ? trackerDeviceId(trackerData.id) : ""))
			?.trackers.find((item) => item.trackerId === trackerData?.id),
	);
	const rssi = $derived(liveTracker?.rssi ?? trackerData?.data.rssi ?? trackerSnapshot?.rssi);
	const sensorRssi = $derived(liveTracker?.sensorRssi ?? trackerData?.data.sensorRssi ?? trackerSnapshot?.sensorRssi);
	const magStatus = $derived(trackerData?.data.magnetometer ?? liveTracker?.mag ?? "unknown");
	const magStatusKey = $derived(magStatus.toLowerCase().replace("verybad", "very_bad"));
	const nextConnection = $derived(
		trackerData?.connection_mode === ConnectionMode.BLE ? ConnectionMode.Serial : ConnectionMode.BLE,
	);

	$effect(() => {
		const id = trackerData?.id;
		if (id && autoLoadedId !== id) {
			autoLoadedId = id;
			void refreshTrackerSettings();
		}
	});

	async function refreshStats(forceLatency = false) {
		if (refreshingStats) return;
		refreshingStats = true;
		try {
			const snapshot = await invoke("getSnapshot");
			liveSnapshot = snapshot;
			const currentDevice = snapshot.devices.find(
				(device) => device.deviceId === (trackerData ? trackerDeviceId(trackerData.id) : ""),
			);
			latency = currentDevice
				? await invoke(
						"getLatency",
						currentDevice.endpointId,
						forceLatency && currentDevice.connection === "ble" ? { force: true } : undefined,
					)
				: undefined;
		} catch {
			latency = undefined;
		} finally {
			refreshingStats = false;
		}
	}

	onMount(() => {
		let active = true;
		void refreshStats();
		const timer = setInterval(() => {
			if (active) void refreshStats();
		}, 1000);
		return () => {
			active = false;
			clearInterval(timer);
		};
	});

	function trackerDeviceId(id: string): string {
		return id.slice(0, id.lastIndexOf(":"));
	}

	function settingsFor(tracker: Tracker): DeviceSettings {
		const deviceId = trackerDeviceId(tracker.id);
		const current = $backendSnapshot.devices.find((device) => device.deviceId === deviceId)?.settings;

		return {
			sensorMode: tracker.settings?.mode ?? current?.sensorMode ?? 2,
			fpsMode: tracker.settings?.fps ?? current?.fpsMode ?? 50,
			sensorAutoCorrection: tracker.settings?.dynamicCalibration.map(
				(kind) => kind as DeviceSettings["sensorAutoCorrection"][number],
			) ?? [...(current?.sensorAutoCorrection ?? [])],
			ankleMotionDetection: current?.ankleMotionDetection ?? false,
		};
	}

	function updateTrackerSettings(tracker: Tracker, settings: DeviceSettings) {
		const deviceId = trackerDeviceId(tracker.id);
		const updatedTrackers = $connectedTrackers.map((item) => {
			if (trackerDeviceId(item.id) !== deviceId) return item;

			const localSettings = {
				fps: settings.fpsMode,
				mode: settings.sensorMode,
				dynamicCalibration: settings.sensorAutoCorrection.map((kind) => kind as LocalAutoCorrection),
				emulatedFeet: item.settings?.emulatedFeet ?? false,
			};
			const updated = { ...item, settings: localSettings };
			void saveTrackerConfig({
				id: updated.id,
				name: updated.name,
				connection_mode: updated.connection_mode,
				tracker_type: updated.tracker_type,
				bodyPart: updated.bodyPart,
				settings: localSettings,
			});

			return updated;
		});

		connectedTrackers.set(updatedTrackers);
		trackerData = updatedTrackers.find((item) => item.id === tracker.id) ?? tracker;
		setFormSettings(settings);
	}

	function setFormSettings(settings: DeviceSettings) {
		fps = String(settings.fpsMode);
		sensorMode = String(settings.sensorMode);
		accelerometer = settings.sensorAutoCorrection.includes("accel");
		gyroscope = settings.sensorAutoCorrection.includes("gyro");
		magnetometer = settings.sensorAutoCorrection.includes("mag");
	}

	async function applyTrackerSettings(patch: Partial<DeviceSettings>) {
		const current = trackerData;
		if (!current || saving) return;

		const base = settingsFor(current);
		const settings: DeviceSettings = {
			sensorMode: patch.sensorMode ?? base.sensorMode,
			fpsMode: patch.fpsMode ?? base.fpsMode,
			sensorAutoCorrection: [...(patch.sensorAutoCorrection ?? base.sensorAutoCorrection)],
			ankleMotionDetection: patch.ankleMotionDetection ?? base.ankleMotionDetection,
		};

		saving = true;

		try {
			const result = await invoke("setSettings", trackerDeviceId(current.id), settings);
			const appliedFields = new Set(result.applied);
			const appliedSettings: DeviceSettings = {
				sensorMode: appliedFields.has("sensorMode") ? settings.sensorMode : base.sensorMode,
				fpsMode: appliedFields.has("fpsMode") ? settings.fpsMode : base.fpsMode,
				sensorAutoCorrection: appliedFields.has("sensorAutoCorrection")
					? settings.sensorAutoCorrection
					: base.sensorAutoCorrection,
				ankleMotionDetection: appliedFields.has("ankleMotionDetection")
					? settings.ankleMotionDetection
					: base.ankleMotionDetection,
			};
			updateTrackerSettings(current, appliedSettings);
			setFormSettings(appliedSettings);

			info(
				["trackers", "settings"],
				`Tracker ${current.id}: applied [${result.applied.join(", ")}], unsupported [${result.unsupported.join(", ")}]`,
			);
			if (result.unsupported.length > 0 || (result.failed?.length ?? 0) > 0) {
				const allUnsupported = [...result.unsupported, ...(result.failed ?? [])];
				ToastManager.add({
					type: "warning",
					message: $t("home.per_tracker.error.settings_partial", {
						settings: allUnsupported.join(", "),
					}),
				});
			}
		} catch (err) {
			setFormSettings(settingsFor(current));
			error(["trackers", "settings"], `Failed to apply settings to tracker ${current.id}: ${String(err)}`);
			ToastManager.add({
				type: "error",
				message: $t("home.per_tracker.error.apply_failed", { error: String(err) }),
			});
		} finally {
			saving = false;
		}
	}

	async function refreshTrackerSettings() {
		const current = trackerData;
		if (!current || saving) return;
		saving = true;
		try {
			const device = await invoke("refreshTracker", current.id);
			const settings = device.settings;
			if (!settings) throw new Error($t("home.per_tracker.error.settings_unavailable"));
			updateTrackerSettings(current, settings);
			info(["trackers", "settings"], `Read settings for tracker ${current.id}`);
		} catch (err) {
			error(["trackers", "settings"], `Failed to get settings for tracker ${current.id}: ${String(err)}`);
			ToastManager.add({
				type: "error",
				message: $t("home.per_tracker.error.get_failed", { error: String(err) }),
			});
		} finally {
			saving = false;
		}
	}

	async function refreshAll() {
		await refreshTrackerSettings();
		await refreshStats(true);
	}

	async function resetSettings() {
		await applyTrackerSettings({
			fpsMode: 50,
			sensorMode: 2,
			sensorAutoCorrection: [],
		});
	}

	async function switchConnection(mode: ConnectionMode) {
		const current = trackerData;
		if (!current || current.connection_mode === mode || saving) return;
		saving = true;
		try {
			await invoke(
				"switchCommunication",
				trackerDeviceId(current.id),
				mode === ConnectionMode.BLE ? "ble" : "serial",
			);
			const updated = { ...current, connection_mode: mode };
			connectedTrackers.update((trackers) => trackers.map((item) => (item.id === current.id ? updated : item)));
			trackerData = updated;
			void saveTrackerConfig({
				id: updated.id,
				name: updated.name,
				connection_mode: updated.connection_mode,
				tracker_type: updated.tracker_type,
				bodyPart: updated.bodyPart,
				settings: updated.settings,
			});
			info(["trackers", "settings"], `Switched ${current.id} to ${mode}`);
		} catch (err) {
			error(["trackers", "settings"], `Failed to switch connection for ${current.id}: ${String(err)}`);
			ToastManager.add({ type: "error", message: String(err) });
		} finally {
			saving = false;
		}
	}

	async function powerOff() {
		if (!trackerData) return;
		const deviceId = trackerDeviceId(trackerData.id);
		const clearExpectedPowerOff = expectTrackerPowerOff([deviceId]);
		try {
			await invoke("powerOff", deviceId);
			info(["trackers", "settings"], `Powered off ${trackerData.id}`);
		} catch (err) {
			clearExpectedPowerOff();
			error(["trackers", "settings"], `Failed to power off ${trackerData.id}: ${String(err)}`);
			ToastManager.add({ type: "error", message: String(err) });
		} finally {
		}
	}

	function setCorrection(kind: DeviceSettings["sensorAutoCorrection"][number], enabled: boolean) {
		const current = trackerData;
		if (!current) return;
		const corrections = settingsFor(current).sensorAutoCorrection;
		const next = enabled ? [...new Set([...corrections, kind])] : corrections.filter((item) => item !== kind);
		void applyTrackerSettings({ sensorAutoCorrection: next });
	}
</script>

<div class="flex flex-col gap-8 p-4">
	<div class="rounded-lg bg-panel p-6 shadow">
		<h1 class="mb-4 font-heading text-2xl">
			{$t("home.per_tracker.title", { name: trackerData?.name ?? "" })}
		</h1>
		<p class="mb-6 text-text-alt">
			{$t("home.per_tracker.description")}
		</p>

		<section class="mb-8 rounded-lg bg-card p-4">
			<h2 class="mb-3 font-heading text-lg">{$t("home.per_tracker.info.title")}</h2>
			<div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
				<p><b>{$t("home.per_tracker.info.device")}</b> {trackerData?.id ?? "-"}</p>
				<p>
					<b>{$t("home.per_tracker.info.model")}</b>
					{trackerData?.tracker_type ?? "-"}
					{deviceSnapshot?.version ? `- ${deviceSnapshot.version}` : ""}
				</p>
				<p>
					<b>{$t("home.per_tracker.info.connection")}</b>
					{$t(
						trackerData?.connection_mode === ConnectionMode.BLE
							? "home.per_tracker.info.bluetooth"
							: "home.per_tracker.info.serial",
					)}
				</p>
				{#if deviceSnapshot?.endpointId}
					<p>
						<b>{$t("home.per_tracker.info.endpoint")}</b>
						{deviceSnapshot.endpointId}
					</p>
				{/if}
				<p>
					<b>{$t("home.per_tracker.info.battery")}</b>
					{trackerData?.data.battery?.remaining === undefined
						? $t("home.per_tracker.stats.unknown")
						: `${trackerData.data.battery.remaining}%`}{trackerData?.data.battery?.voltage === undefined
						? ""
						: ` - ${trackerData.data.battery.voltage / 1000} V`}{trackerData?.data.battery?.status
						? ` - ${trackerData.data.battery.status}`
						: ""}
				</p>
				{#if deviceSnapshot?.comm}
					<p>
						<b>{$t("home.per_tracker.info.communication")}</b>
						{deviceSnapshot.comm}{deviceSnapshot.commNext ? ` - next: ${deviceSnapshot.commNext}` : ""}
					</p>
				{/if}
			</div>
			<div class="mt-5 border-t border-secondary/50 pt-4">
				<h3 class="mb-3 flex items-center gap-2 font-heading text-lg">
					{$t("home.per_tracker.stats.title")}
				</h3>
				<div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
					<p>
						<b>{$t("home.card.status.text")}</b>
						<span class="inline-flex items-center gap-1 uppercase">
							{$t(`home.card.status.${magStatusKey}`)}
						</span>
					</p>
					<p>
						<b>{$t("home.per_tracker.stats.rssi")}</b>
						{rssi === undefined ? "N/A" : `${rssi} dBm`}
					</p>
					{#if sensorRssi !== undefined}
						<p>
							<b>{$t("home.per_tracker.stats.tracker_rssi")}</b>
							{sensorRssi} dBm
						</p>
					{/if}
					{#if deviceSnapshot?.endpointId}
						<p>
							<b>{$t("home.per_tracker.stats.latency")}</b>
							{latency === undefined ? $t("home.per_tracker.stats.unknown") : `${latency.toFixed(2)} ms`}
						</p>
					{/if}
				</div>
			</div>
			<div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Button
					label={$t(
						nextConnection === ConnectionMode.BLE
							? "home.per_tracker.info.switch_ble"
							: "home.per_tracker.info.switch_serial",
					)}
					background="primary"
					icon={nextConnection === ConnectionMode.BLE ? "mdi:bluetooth" : "mdi:usb"}
					onClick={() => switchConnection(nextConnection)}
					disabled={saving}
				/>
				<Button
					label={$t("home.per_tracker.info.power_off")}
					background="primary"
					icon="ri:shut-down-line"
					onClick={powerOff}
				/>
			</div>
		</section>

		<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("home.per_tracker.fps.name")}
					<Tooltip content={$t("home.per_tracker.fps.tooltip")} icon="ri:information-line" width="300px" />
				</h3>
				<Select
					options={[
						{ value: "50", label: "50 FPS" },
						{ value: "100", label: "100 FPS" },
					]}
					bind:selected={fps}
					disabled={saving}
					onChange={(value) =>
						void applyTrackerSettings({ fpsMode: Number(value) as DeviceSettings["fpsMode"] })}
				/>
			</div>

			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("home.per_tracker.sensor_mode.name")}
					<Tooltip
						content={$t("home.per_tracker.sensor_mode.tooltip")}
						icon="ri:information-line"
						width="300px"
					/>
				</h3>
				<Select
					options={[
						{ value: "2", label: "Mode 2" },
						{ value: "1", label: "Mode 1" },
					]}
					bind:selected={sensorMode}
					disabled={saving}
					onChange={(value) =>
						void applyTrackerSettings({ sensorMode: Number(value) as DeviceSettings["sensorMode"] })}
				/>
			</div>

			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("home.per_tracker.sensor_auto_correction.name")}
					<Tooltip
						content={$t("home.per_tracker.sensor_auto_correction.tooltip")}
						icon="ri:information-line"
						width="300px"
					/>
				</h3>
				<div class="flex flex-col gap-3 pl-1">
					<Switch
						label="Accelerometer"
						bind:selected={() => accelerometer, (on) => setCorrection("accel", on)}
						disabled={saving}
					/>
					<Switch
						label="Gyroscope"
						bind:selected={() => gyroscope, (on) => setCorrection("gyro", on)}
						disabled={saving}
					/>
					<Switch
						label="Magnetometer"
						bind:selected={() => magnetometer, (on) => setCorrection("mag", on)}
						disabled={saving}
					/>
				</div>
			</div>

			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("home.per_tracker.virtual_feet.name")}
					<Tooltip
						content={$t("home.per_tracker.virtual_feet.tooltip")}
						icon="ri:information-line"
						width="250px"
					/>
				</h3>
				<Switch label={$t("home.per_tracker.virtual_feet.name")} bind:selected={emulatedFeet} disabled />
			</div>

			<div class="col-span-2 flex flex-col gap-4">
				<h3
					class="text-warning mb-4 flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg"
				>
					{$t("home.per_tracker.debugging")}
					<Icon
						icon="ri:information-line"
						width={20}
						class="text-text-alt transition-colors hover:text-white"
					/>
				</h3>
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<Button
						label={$t("home.per_tracker.refresh")}
						icon="ri:refresh-line"
						background="primary"
						onClick={refreshAll}
						disabled={saving}
					/>
					<Button
						label={$t("home.per_tracker.reset_settings")}
						icon="ri:restart-line"
						background="primary"
						onClick={resetSettings}
						disabled={saving}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
