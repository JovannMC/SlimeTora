<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { untrack } from "svelte";
	import Icon from "@iconify/svelte";
	import { invoke } from "#lib/api/backend";
	import { backendSnapshot } from "#lib/backend/state";
	import { error, info } from "#lib/log/index";
	import { ToastManager } from "#lib/util/toast.svelte";
	import { t } from "#lib/lang/index";
	import { connectedTrackers, saveTrackerConfig, type Tracker } from "#lib/store/index";
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
			await invoke("setSettings", trackerDeviceId(current.id), settings);
			updateTrackerSettings(current, settings);
			info(["trackers", "settings"], `Applied settings to tracker ${current.id}`);
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

	async function getTrackerSettings() {
		const current = trackerData;
		if (!current || saving) return;
		saving = true;
		try {
			const snapshot = await invoke("getSnapshot");
			const settings = snapshot.devices.find(
				(device) => device.deviceId === trackerDeviceId(current.id),
			)?.settings;
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

	async function resetSettings() {
		await applyTrackerSettings({
			fpsMode: 50,
			sensorMode: 2,
			sensorAutoCorrection: [],
		});
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
				<div class="flex flex-col gap-4">
					<Button
						label={$t("home.per_tracker.get_settings")}
						background="primary"
						onClick={getTrackerSettings}
						disabled={saving}
					/>
					<Button
						label={$t("home.per_tracker.reset_settings")}
						background="primary"
						onClick={resetSettings}
						disabled={saving}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
