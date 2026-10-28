<script lang="ts">
	import Icon from "@iconify/svelte";
	import { tracker } from "#lib/store/settings";
	import { FPSMode, SensorAutoCorrection, SensorMode } from "#lib/types/tracker";
	import { t } from "#lib/lang/index";
	import Input from "#lib/components/settings/Input.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import Switch from "#lib/components/settings/Switch.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";

	const CORRECTIONS = [
		{ kind: SensorAutoCorrection.Accel, label: "Accelerometer" },
		{ kind: SensorAutoCorrection.Gyro, label: "Gyroscope" },
		{ kind: SensorAutoCorrection.Mag, label: "Magnetometer" },
	];

	function setFps(value: string) {
		tracker.update((s) => ({ ...s, fps: Number(value) as FPSMode }));
	}

	function setSensorMode(value: string) {
		tracker.update((s) => ({ ...s, mode: Number(value) as SensorMode }));
	}

	function setCorrection(kind: SensorAutoCorrection, on: boolean) {
		tracker.update((s) => ({
			...s,
			dynamicCalibration: CORRECTIONS.map((c) => c.kind).filter((k) =>
				k === kind ? on : s.dynamicCalibration.includes(k),
			),
		}));
	}
</script>

<div class="rounded-lg bg-panel p-6 shadow">
	<h2 class="mb-6 flex items-center gap-2 font-heading text-2xl">
		<Icon icon="ri:compass-3-line" class="text-secondary" width={28} />
		{$t("settings.tracker.title")}
	</h2>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.tracker.fps.name")}
				<Tooltip content={$t("settings.tracker.fps.tooltip")} icon="ri:information-line" width="300px" />
			</h3>
			<Select
				options={[
					{ value: "50", label: $t("settings.tracker.fps.50") },
					{ value: "100", label: $t("settings.tracker.fps.100") },
				]}
				selected={String($tracker.fps)}
				onChange={setFps}
			/>
		</div>

		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.tracker.sensor_mode.name")}
				<Tooltip
					content={$t("settings.tracker.sensor_mode.tooltip")}
					icon="ri:information-line"
					width="300px"
				/>
			</h3>
			<Select
				options={[
					{ value: "2", label: $t("settings.tracker.sensor_mode.2") },
					{ value: "1", label: $t("settings.tracker.sensor_mode.1") },
				]}
				selected={String($tracker.mode)}
				onChange={setSensorMode}
			/>
		</div>

		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.tracker.sensor_auto_correction.name")}
				<Tooltip
					content={$t("settings.tracker.sensor_auto_correction.tooltip")}
					icon="ri:information-line"
					width="300px"
				/>
			</h3>
			<div class="flex flex-col gap-3 pl-1">
				{#each CORRECTIONS as { kind, label }}
					<Switch
						{label}
						bind:selected={
							() => $tracker.dynamicCalibration.includes(kind), (on) => setCorrection(kind, on)
						}
					/>
				{/each}
			</div>
		</div>

		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.tracker.virtual_feet.name")}
				<Tooltip
					content={$t("settings.tracker.virtual_feet.tooltip")}
					icon="ri:information-line"
					width="250px"
				/>
			</h3>
			<Switch label={$t("settings.tracker.virtual_feet.name")} bind:selected={$tracker.emulatedFeet} />
		</div>

		<div class="col-span-2 flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.tracker.other_settings.name")}
				<Tooltip
					content={$t("settings.tracker.other_settings.tooltip")}
					icon="ri:information-line"
					width="250px"
				/>
			</h3>
			<div class="flex flex-row gap-3 pl-1">
				<Input
					className="flex-1"
					label={$t("settings.tracker.heartbeat.name")}
					type="number"
					icon="ri:heart-pulse-line"
					placeholder="2000"
					tooltip={$t("settings.tracker.heartbeat.tooltip")}
					tooltipPosition="up"
					tooltipWidth="250px"
					bind:value={$tracker.heartbeat}
				/>
				<Input
					className="flex-1"
					label={$t("settings.tracker.button_debounce.name")}
					type="number"
					icon="ri:timer-line"
					placeholder="500"
					tooltip={$t("settings.tracker.button_debounce.tooltip")}
					tooltipPosition="up"
					tooltipWidth="250px"
					bind:value={$tracker.buttonDebounce}
				/>
			</div>
		</div>
	</div>
</div>
