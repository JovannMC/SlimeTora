<script lang="ts">
	import Icon from "@iconify/svelte";
	import { goto } from "$app/navigation";
	import Button from "#lib/components/settings/Button.svelte";
	import Switch from "#lib/components/settings/Switch.svelte";
	import Card from "#lib/components/trackers/Card.svelte";
	import { t } from "#lib/lang/index";
	import { isOn, connectedTrackers, trackerOpenStates } from "#lib/store/index";
	import { sessionState } from "#lib/backend/state";
	import { stopInterpreting } from "#lib/backend/index";
	import { error, info } from "#lib/log/index";
	import { program } from "#lib/store/settings";
	import { onMount } from "svelte";
	import { invoke } from "#lib/api/backend.ts";
	import { ToastManager } from "#lib/util/toast.svelte.ts";
	import { expectTrackerPowerOff } from "#lib/backend/notifications";

	let isExpanded = $state(false);
	let poweringOff = $state(false);
	let trackersRendered = $state(false);
	let isSmall = $state(window.matchMedia("(max-width: 768px)").matches);

	$effect(() => {
		if (!$isOn || $connectedTrackers.length === 0) trackersRendered = false;
	});

	function onCardMount() {
		// keep the searching label through the first frame that displays a tracker card
		let frame = requestAnimationFrame(() => {
			frame = requestAnimationFrame(() => {
				trackersRendered = true;
			});
		});
		return () => cancelAnimationFrame(frame);
	}

	// spread trackers over two columns, alternating
	const leftColumn = $derived($connectedTrackers.filter((_, i) => i % 2 === 0));
	const rightColumn = $derived($connectedTrackers.filter((_, i) => i % 2 === 1));
	const statusLabel = $derived.by(() => {
		if ($sessionState.status === "starting")
			return $t($sessionState.phase === "searching" ? "home.searching" : "home.starting");
		if ($sessionState.status === "on") {
			if ($connectedTrackers.length === 0 || !trackersRendered) return $t("home.searching");
			return $t($sessionState.slimevrConnected ? "home.connected" : "home.slimevr_not_found");
		}

		const labels = {
			off: "home.disconnected",
			stopping: "home.stopping",
			error: "home.session_error",
		} as const;
		return $t(labels[$sessionState.status]);
	});

	onMount(() => {
		window.addEventListener("resize", updateIsSmall);
		return () => window.removeEventListener("resize", updateIsSmall);
	});

	function updateIsSmall() {
		isSmall = window.matchMedia("(max-width: 768px)").matches;
	}

	function toggleTracking() {
		if ($sessionState.status === "error" && !$sessionState.requestedEnabled) {
			void stopInterpreting().catch((err) => error(["backend"], `Failed to stop tracking: ${err}`));
			return;
		}
		isOn.update((on) => !on);
	}

	// expands every card, or collapses them all if any are open
	function toggleAll() {
		const anyOpen = Object.values($trackerOpenStates).some((open) => open);
		trackerOpenStates.set(Object.fromEntries($connectedTrackers.map((tracker) => [tracker.id, !anyOpen])));
		isExpanded = !anyOpen;
	}

	async function powerOffTrackers() {
		if (poweringOff) return;
		const deviceIds = $connectedTrackers.map((tracker) => tracker.id.split(":")[0] as string);
		const displayNames = $connectedTrackers.map((tracker) => tracker.name).join(", ");

		poweringOff = true;
		const clearExpectedPowerOff = expectTrackerPowerOff(deviceIds);
		try {
			await invoke("powerOff", deviceIds);
			info(["trackers", "card"], `Powered off tracker devices: ${displayNames} (${deviceIds.join(", ")})`);
		} catch (err) {
			clearExpectedPowerOff();
			error(["trackers", "card"], `Failed to power off tracker ${deviceIds.join(", ")}: ${String(err)}`);
			ToastManager.add({
				type: "error",
				message: $t("home.card.error.power_off_failed", { name: displayNames, error: String(err) }),
			});
		} finally {
			poweringOff = false;
		}
	}
</script>

<div class="flex flex-col gap-6 p-6">
	<div class="relative isolate -mx-6 -mt-6 flex items-center gap-8 px-10 py-10">
		<div class="status-bg" class:off={$sessionState.status !== "on"}></div>
		<button
			class="power-button hoverable"
			class:connected={$sessionState.status === "on"}
			aria-label={$sessionState.status === "error" && !$sessionState.requestedEnabled
				? $t("home.retry_stop")
				: statusLabel}
			onclick={toggleTracking}
		>
			<Icon class="text-white" icon="ri:shut-down-line" width={40} />
		</button>

		<div class="flex flex-col gap-1">
			<p class="font-heading text-2xl">
				{statusLabel}
			</p>
			<p class="font-heading text-lg text-text-alt">
				{$t("home.count", { value: $connectedTrackers.length })}
			</p>
			{#if $sessionState.error}
				<p class="text-sm text-red-300" role="alert">{$sessionState.error}</p>
			{/if}
		</div>
	</div>

	<div class="w-full rounded-lg bg-panel p-6 shadow">
		<h2 class="mb-4 text-lg font-semibold">{$t("home.settings.title")}</h2>
		<div class="flex flex-col gap-4">
			<div class="flex flex-row gap-2">
				<Button
					label={$t("home.settings.collapse_expand")}
					icon={!isExpanded ? "ri:expand-diagonal-2-line" : "ri:collapse-diagonal-2-line"}
					onClick={toggleAll}
				/>
				<Button
					label={$t("home.settings.pairing")}
					icon="ri:bluetooth-connect-line"
					background="quaternary"
					onClick={() => goto("/trackers/pairing")}
				/>
				<Button
					label={$t("home.settings.turn_off")}
					icon="ri:shut-down-line"
					background="secondary"
					onClick={powerOffTrackers}
				/>
			</div>
			<div class="flex flex-row items-center justify-evenly gap-2">
				<Switch label={$t("home.settings.precise_data")} bind:selected={$program.preciseData} />
				<Switch label={$t("home.settings.fast_data")} bind:selected={$program.fastData} />
				<Switch label={$t("home.settings.visualization")} bind:selected={$program.visualization} />
			</div>
		</div>
	</div>

	{#if $isOn}
		{#if $connectedTrackers.length === 0}
			<div class="rounded-lg bg-panel py-8 text-center">{$t("home.none")}</div>
		{:else}
			{#if isSmall}
				<div class="flex flex-col gap-4">
					{#each $connectedTrackers as tracker (tracker.id)}
						<Card id={tracker.id} type={tracker.tracker_type} {onCardMount} />
					{/each}
				</div>
			{:else}
				<div class="flex flex-row gap-4">
					<div class="flex flex-1 flex-col gap-4">
						{#each leftColumn as tracker (tracker.id)}
							<Card id={tracker.id} type={tracker.tracker_type} {onCardMount} />
						{/each}
					</div>
					<div class="flex flex-1 flex-col gap-4">
						{#each rightColumn as tracker (tracker.id)}
							<Card id={tracker.id} type={tracker.tracker_type} {onCardMount} />
						{/each}
					</div>
				</div>
			{/if}
		{/if}
	{/if}
</div>

<style>
	@reference "../../app.css";

	.status-bg {
		@apply absolute inset-0 -z-10;
		background: var(--status-glow);
		opacity: 0.5;
		mask-image: linear-gradient(to bottom, black 40%, transparent 100%);
		transition: filter 0.3s;
	}

	.status-bg.off {
		filter: brightness(0.4);
	}

	.power-button {
		@apply relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full shadow-lg hover:bg-secondary/24 active:bg-secondary/12;
		background: var(--slimetora-gradient-alt);
	}

	.power-button.connected {
		background: var(--slimetora-gradient);
		z-index: 0;
	}

	.power-button.connected::before {
		background: rgba(0, 0, 0, 0.2);
	}

	.power-button::before {
		@apply absolute inset-0 z-[-1] rounded-full p-1;
		content: "";
		background: var(--slimetora-gradient);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask-composite: exclude;
	}
</style>
