<script lang="ts">
	import { page } from "$app/state";
	import { goto } from "$app/navigation";
	import { untrack } from "svelte";
	import Icon from "@iconify/svelte";
	import { error, info } from "#lib/log/index.js";
	import { t } from "#lib/lang/index.js";
	import { connectedTrackers, type Tracker } from "#lib/store/index.js";
	import Button from "#lib/components/settings/Button.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import Switch from "#lib/components/settings/Switch.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";

	// TODO: finish this (the settings below are not saved yet)

	const trackerId = $derived(page.url.searchParams.get("trackerId"));
	let trackerData: Tracker | undefined = $state();

	// look the tracker up once per id, and go back to the list if it can't be found
	$effect(() => {
		const id = trackerId;
		if (!id) {
			error("Tracker ID is undefined. Redirecting to trackers list.");
			goto("/trackers");
			return;
		}

		trackerData = untrack(() => $connectedTrackers.find((t) => t.id === id));
		if (!trackerData) {
			error(`Tracker with ID ${id} not found. Redirecting to trackers list.`);
			goto("/trackers");
		}
	});

	let fps = $state("50");
	let sensorMode = $state("2");
	let accelerometer = $state(true);
	let gyroscope = $state(false);
	let magnetometer = $state(false);
	let emulatedFeet = $state(false);

	function getTrackerSettings() {
		info(`Getting settings for tracker ${trackerId}`);
	}

	function resetSettings() {
		info(`Resetting settings for tracker ${trackerId}`);
	}
</script>

<div class="flex flex-col gap-8 p-4">
	<div class="rounded-lg bg-panel p-6 shadow">
		<h1 class="mb-4 font-heading text-2xl">
			{$t("trackers.per_tracker.title", { name: trackerData?.name ?? "" })}
		</h1>
		<p class="mb-6 text-text-alt">
			{$t("trackers.per_tracker.description")}
		</p>

		<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("trackers.per_tracker.fps.name")}
					<Tooltip
						content={$t("trackers.per_tracker.fps.tooltip")}
						icon="ri:information-line"
						width="300px"
					/>
				</h3>
				<Select
					options={[
						{ value: "50", label: "50 FPS" },
						{ value: "100", label: "100 FPS" },
					]}
					bind:selected={fps}
				/>
			</div>

			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("trackers.per_tracker.sensor_mode.name")}
					<Tooltip
						content={$t("trackers.per_tracker.sensor_mode.tooltip")}
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
				/>
			</div>

			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("trackers.per_tracker.sensor_auto_correction.name")}
					<Tooltip
						content={$t("trackers.per_tracker.sensor_auto_correction.tooltip")}
						icon="ri:information-line"
						width="300px"
					/>
				</h3>
				<div class="flex flex-col gap-3 pl-1">
					<Switch label="Accelerometer" bind:selected={accelerometer} />
					<Switch label="Gyroscope" bind:selected={gyroscope} />
					<Switch label="Magnetometer" bind:selected={magnetometer} />
				</div>
			</div>

			<div class="flex flex-col gap-4">
				<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
					{$t("trackers.per_tracker.virtual_feet.name")}
					<Tooltip
						content={$t("trackers.per_tracker.virtual_feet.tooltip")}
						icon="ri:information-line"
						width="250px"
					/>
				</h3>
				<Switch label={$t("trackers.per_tracker.virtual_feet.name")} bind:selected={emulatedFeet} />
			</div>

			<div class="col-span-2 flex flex-col gap-4">
				<h3
					class="text-warning mb-4 flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg"
				>
					{$t("trackers.per_tracker.debugging")}
					<Icon
						icon="ri:information-line"
						width={20}
						class="text-text-alt transition-colors hover:text-white"
					/>
				</h3>
				<div class="flex flex-col gap-4">
					<Button
						label={$t("trackers.per_tracker.get_settings")}
						background="primary"
						onClick={getTrackerSettings}
					/>
					<Button
						label={$t("trackers.per_tracker.reset_settings")}
						background="primary"
						onClick={resetSettings}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
