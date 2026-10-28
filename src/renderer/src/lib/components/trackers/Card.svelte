<script lang="ts">
	import Icon from "@iconify/svelte";
	import { goto } from "$app/navigation";
	import { connectedTrackers, trackerOpenStates } from "#lib/store/index";
	import { program } from "#lib/store/settings";
	import { info } from "#lib/log/index";
	import { t } from "#lib/lang/index";
	import { ChargeStatus } from "#lib/types/tracker";
	import Tooltip from "../settings/Tooltip.svelte";
	import TrackerVisualization from "./TrackerVisualization.svelte";

	let { name, id, type }: { name: string; id: string; type: string } = $props();

	const tracker = $derived($connectedTrackers.find((t) => t.id === id));
	const isOpen = $derived($trackerOpenStates[id] ?? false);
	const decimals = $derived($program.preciseData ? 2 : 0);

	const rotation = $derived(tracker?.data.rotation?.map((v) => Number(v.toFixed(decimals))) ?? [0, 0, 0]);
	const acceleration = $derived(tracker?.data.acceleration?.map((v) => Number(v.toFixed(decimals))) ?? [0, 0, 0]);
	const batteryPercent = $derived(tracker?.data.battery?.remaining ?? -1);
	const batteryVoltage = $derived(tracker?.data.battery?.voltage ?? -1);
	const batteryStatus = $derived(tracker?.data.battery?.status ?? ChargeStatus.Discharging);
	const magStatus = $derived(tracker?.data.magnetometer ?? "N/A");
	const rssi = $derived(tracker?.data.rssi ?? 1);
	const magClass = $derived(`mag-status-${magStatus.toLowerCase().replace(/\s/g, "_")}`);

	const visualization = $derived($program.visualization ?? true);
	const visualizationFPS = $derived(($program.visualizationFPS ?? 60));

	function toggleOpen() {
		trackerOpenStates.update((states) => ({ ...states, [id]: !isOpen }));
	}
</script>

<!-- TODO: add tracker connection mode (maybe part assignment too?) -->
<div
	class="flex h-auto w-full flex-col overflow-hidden rounded-xl bg-card shadow-card transition-all duration-300"
	id="tracker-card-{id}"
>
	<!-- collapsed header -->
	<div
		class="hoverable flex h-14 items-center justify-between px-4"
		role="button"
		aria-expanded={isOpen}
		tabindex="0"
		onclick={toggleOpen}
		onkeydown={(e) => e.key === "Enter" && toggleOpen()}
	>
		<div>
			<p class="text-left font-body">{name}</p>
			<div class="flex items-center gap-2 text-sm">
				<div class="flex items-center gap-1">
					<Icon icon="ri:battery-fill" width={14} class="text-text-alt" />
					<p class="text-sm text-text-alt" id="battery-small">{batteryPercent}%</p>
				</div>
				<p class="flex items-center gap-1 text-sm text-text-alt" id="mag-small">
					<Icon icon="ri:compass-3-fill" width={14} class="bg-transparent! {magClass}" id="mag-icon" />
					<span class="bg-transparent! uppercase {magClass}" id="mag-text">{magStatus}</span>
				</p>
				<div class="flex items-center gap-1" id="rssi-status">
					<Icon icon="ri:signal-wifi-fill" width={14} class="text-text-alt" />
					<span class="text-text-alt" id="rssi">{rssi} dBm</span>
				</div>
			</div>
		</div>
		<div class="flex items-center gap-1">
			<button
				class="rounded-md p-1 hover:bg-secondary/20 active:bg-secondary/10"
				aria-label={$t("home.card.power_off", { name })}
				onclick={(e) => {
					e.stopPropagation();
					info(["trackers", "card"], `Powered off tracker: ${name} (${id})`);
				}}
			>
				<Icon icon="ri:shut-down-line" width={18} class="text-text-alt" />
			</button>
			<button
				class="rounded-md p-1 hover:bg-secondary/20 active:bg-secondary/10"
				aria-label={$t("home.card.settings", { name })}
				onclick={(e) => {
					e.stopPropagation();
					info(["trackers", "card"], `Settings clicked for: ${name}`);
					goto(`/trackers/settings?trackerId=${id}`);
				}}
			>
				<Icon icon="ri:settings-3-line" width={18} class="text-text-alt" />
			</button>
			<Icon icon={isOpen ? "ri:arrow-up-s-line" : "ri:arrow-down-s-line"} width={24} class="text-text-alt" />
		</div>
	</div>

	{#if isOpen}
		<div class="m-4 mt-0 flex flex-col gap-2 rounded-lg bg-panel p-4">
			<p><b>{$t("home.card.device")}</b> <span id="device-type">{id} ({type})</span></p>
			<p>
				<b>{$t("home.card.imu")}</b> <span id="imu">{rotation.join(", ")} ({acceleration.join(", ")})</span>
			</p>
			<p class="flex flex-row items-center">
				<b>{$t("home.card.battery")}</b>
				<span class="ml-1 flex flex-row items-center justify-center gap-1" id="battery-main">
					<span>{batteryPercent}% ({batteryVoltage / 1000}V)</span>
					{#if batteryStatus === ChargeStatus.Charging}
						<Icon icon="ri:flashlight-fill" width={16} class="ml-1 inline-block text-yellow-500" />
					{/if}
				</span>
			</p>
			<div id="status" class="flex items-center gap-1 text-center">
				<b>{$t("home.card.status.text")}</b>
				<div class="flex items-center gap-2" id="battery-status">
					<div class="flex items-center gap-1" id="mag-status">
						<Tooltip content={$t("home.card.tooltip.mag_status")} position="up" width="200px">
							<Icon
								icon="ri:compass-3-fill"
								width={16}
								class="bg-transparent! {magClass}"
								id="mag-icon"
							/>
						</Tooltip>
						<span class="bg-transparent! uppercase {magClass}" id="mag-text">
							{magStatus === "N/A" || magStatus === "unknown"
								? $t("home.card.status.unknown")
								: $t(`home.card.status.${magStatus.toLowerCase()}`)}
						</span>
					</div>
					<div class="flex items-center gap-1" id="rssi-status">
						<Tooltip content={$t("home.card.tooltip.rssi")} position="up" width="200px">
							<Icon icon="ri:signal-wifi-fill" width={16} class="text-text-alt" />
						</Tooltip>
						<span class="text-text-alt" id="rssi">{rssi} dBm</span>
					</div>
				</div>
			</div>

			{#if visualization}
				<TrackerVisualization {rotation} {acceleration} fps={visualizationFPS} />
			{:else}
				<img src="/tracker.png" alt="Tracker" class="mx-auto mt-2" style="width: 150px;" />
			{/if}
		</div>
	{/if}
</div>
