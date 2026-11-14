<script lang="ts">
	import Icon from "@iconify/svelte";
	import { goto } from "$app/navigation";
	import { invoke } from "#lib/api/backend";
	import { connectedTrackers, trackerOpenStates } from "#lib/store/index";
	import { trackerMotion } from "#lib/store/tracker-motion";
	import { observeTrackerMotion } from "#lib/backend/motion-visibility";
	import { expectTrackerPowerOff } from "#lib/backend/notifications";
	import { ConnectionMode } from "#lib/types/connection";
	import { program } from "#lib/store/settings";
	import { error, info } from "#lib/log/index";
	import { ToastManager } from "#lib/util/toast.svelte";
	import { t } from "#lib/lang/index";
	import { ChargeStatus } from "#lib/types/tracker";
	import Tooltip from "../settings/Tooltip.svelte";
	import { onMount, untrack } from "svelte";

	let { id, type, onCardMount }: { id: string; type: string; onCardMount?: () => () => void } = $props();

	onMount(() => onCardMount?.());

	const motion = trackerMotion(untrack(() => id));

	const tracker = $derived($connectedTrackers.find((t) => t.id === id));
	const displayName = $derived(tracker?.bodyPart || id);
	const connectionIcon = $derived(tracker?.connection_mode === ConnectionMode.BLE ? "mdi:bluetooth" : "mdi:usb");
	const isOpen = $derived($trackerOpenStates[id] ?? false);
	const decimals = $derived($program.preciseData ? 2 : 0);

	const rotation = $derived($motion.rotation.map((v) => Number(v.toFixed(decimals))));
	const acceleration = $derived($motion.acceleration.map((v) => Number(v.toFixed(decimals))));
	const batteryPercent = $derived(tracker?.data.battery?.remaining);
	const batteryVoltage = $derived(tracker?.data.battery?.voltage);
	const batteryStatus = $derived(tracker?.data.battery?.status ?? ChargeStatus.Discharging);
	const magStatus = $derived(tracker?.data.magnetometer ?? "N/A");
	const magClass = $derived(`mag-status-${magStatus.toLowerCase().replace(/\s/g, "_")}`);
	const magStatusDisplay = $derived(
		magStatus === "N/A" || magStatus === "unknown"
			? $t("home.card.status.unknown")
			: $t(`home.card.status.${magStatus.toLowerCase()}`),
	);
	const rssi = $derived(tracker?.data.rssi);

	const visualization = $derived($program.visualization ?? true);
	const visualizationFPS = $derived($program.visualizationFPS ?? 60);
	let poweringOff = $state(false);

	async function powerOffTracker() {
		if (poweringOff) return;
		const deviceId = id.slice(0, id.lastIndexOf(":"));
		poweringOff = true;
		const clearExpectedPowerOff = expectTrackerPowerOff([deviceId]);
		try {
			const [result] = await invoke("powerOff", deviceId);
			if (!result?.success) throw new Error(result?.error ?? `power off failed for ${deviceId}`);
			info(["trackers", "card"], `Powered off tracker device: ${displayName} (${deviceId})`);
		} catch (err) {
			clearExpectedPowerOff();
			error(["trackers", "card"], `Failed to power off tracker ${deviceId}: ${String(err)}`);
			ToastManager.add({
				type: "error",
				message: $t("home.card.error.power_off_failed", { name: displayName, error: String(err) }),
			});
		} finally {
			poweringOff = false;
		}
	}

	function toggleOpen() {
		trackerOpenStates.update((states) => ({ ...states, [id]: !isOpen }));
	}
</script>

<div
	class="tracker-card flex h-auto w-full flex-col overflow-hidden rounded-xl bg-card shadow-card transition-all duration-300"
	id="tracker-card-{id}"
>
	<!-- collapsed header -->
	<div class="tracker-card-header flex h-14 items-center justify-between px-4">
		<button
			type="button"
			class="hoverable flex h-full min-w-0 flex-1 items-center justify-between text-left"
			aria-expanded={isOpen}
			onclick={toggleOpen}
		>
			<span class="min-w-0">
				<span class="block text-left font-body">{displayName}</span>
				<span class="flex items-center gap-2 text-sm">
					<Icon icon={connectionIcon} width={14} class="text-text-alt" />
					<span class="flex items-center gap-1">
						<Icon icon="ri:battery-fill" width={14} class="text-text-alt" />
						<span class="text-sm text-text-alt" id="battery-small">
							{batteryPercent === undefined ? $t("home.card.status.unknown") : `${batteryPercent}%`}
						</span>
					</span>
					<span class="flex items-center gap-1 text-sm text-text-alt" id="mag-small">
						<Icon icon="ri:compass-3-fill" width={14} class="bg-transparent! {magClass}" id="mag-icon" />
						<span class="bg-transparent! uppercase {magClass}" id="mag-text">{magStatusDisplay}</span>
					</span>
					<span class="flex items-center gap-1" id="rssi-status">
						<Icon icon="ri:signal-wifi-fill" width={14} class="text-text-alt" />
						<span class="text-text-alt" id="rssi">{rssi === undefined ? "N/A" : `${rssi} dBm`}</span>
					</span>
				</span>
			</span>
			<Icon icon={isOpen ? "ri:arrow-up-s-line" : "ri:arrow-down-s-line"} width={24} class="text-text-alt" />
		</button>
		<div class="flex shrink-0 items-center gap-1">
			<button
				type="button"
				class="rounded-md p-1 hover:bg-secondary/20 active:bg-secondary/10 disabled:opacity-50"
				disabled={poweringOff}
				aria-label={$t("home.card.power_off", { name: displayName })}
				onclick={powerOffTracker}
			>
				<Icon icon="ri:shut-down-line" width={18} class="text-text-alt" />
			</button>
			<button
				type="button"
				class="rounded-md p-1 hover:bg-secondary/20 active:bg-secondary/10"
				aria-label={$t("home.card.settings", { name: displayName })}
				onclick={() => {
					info(["trackers", "card"], `Settings clicked for: ${displayName}`);
					goto(`/trackers/settings?trackerId=${id}`);
				}}
			>
				<Icon icon="ri:settings-3-line" width={18} class="text-text-alt" />
			</button>
		</div>
	</div>

	{#if isOpen}
		<div
			id="tracker-details-{id}"
			class="m-4 mt-0 flex flex-col gap-2 rounded-lg bg-panel p-4"
			use:observeTrackerMotion={id}
		>
			<!-- basic details -->
			<p class="flex items-center gap-1">
				<b>{$t("home.card.device")}</b>
				<span id="device-type">{id} ({type})</span>
				<Icon icon={connectionIcon} width={16} class="text-text-alt" />
			</p>

			<!-- imu data -->
			<p>
				<b>{$t("home.card.imu")}</b> <span id="imu">{rotation.join(", ")} ({acceleration.join(", ")})</span>
			</p>

			<!-- battery data -->
			<p class="flex flex-row items-center">
				<b>{$t("home.card.battery")}</b>
				<span class="ml-1 flex flex-row items-center justify-center gap-1" id="battery-main">
					<span>
						{batteryPercent === undefined ? $t("home.card.status.unknown") : `${batteryPercent}%`}
						({batteryVoltage === undefined ? $t("home.card.status.unknown") : `${batteryVoltage / 1000}V`})
					</span>
					{#if batteryStatus === ChargeStatus.Charging}
						<Icon icon="ri:flashlight-fill" width={16} class="ml-1 inline-block text-yellow-500" />
					{/if}
				</span>
			</p>

			<!-- status data -->
			<div id="status" class="flex items-center gap-1 text-center">
				<b>{$t("home.card.status.text")}</b>
				<div class="flex items-center gap-2" id="battery-status">
					<!-- mag status -->
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
							{magStatusDisplay}
						</span>
					</div>
					<!-- rssi status -->
					<div class="flex items-center gap-1" id="rssi-status">
						<Tooltip content={$t("home.card.tooltip.rssi")} position="up" width="200px">
							<Icon icon="ri:signal-wifi-fill" width={16} class="text-text-alt" />
						</Tooltip>
						<span class="text-text-alt" id="rssi">{rssi === undefined ? "N/A" : `${rssi} dBm`}</span>
					</div>
				</div>
			</div>

			{#if visualization}
				{#await import("./TrackerVisualization.svelte")}
					<img src="/tracker.png" alt="Tracker" class="mx-auto mt-2" style="width: 150px;" />
				{:then { default: TrackerVisualization }}
					<TrackerVisualization
						rotation={$motion.quaternion}
						acceleration={$motion.acceleration}
						fps={visualizationFPS}
					/>
				{/await}
			{:else}
				<img src="/tracker.png" alt="Tracker" class="mx-auto mt-2" style="width: 150px;" />
			{/if}
		</div>
	{/if}
</div>
