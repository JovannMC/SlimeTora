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
	import { error } from "#lib/log/index";
	import { program } from "#lib/store/settings";
	import { onMount } from "svelte";

	let isSmall = $state(window.matchMedia("(max-width: 768px)").matches);

	onMount(() => {
		window.addEventListener("resize", () => {
			isSmall = window.matchMedia("(max-width: 768px)").matches;
		});

		return () => {
			window.removeEventListener("resize", () => {
				isSmall = window.matchMedia("(max-width: 768px)").matches;
			});
		};
	});

	// spread trackers over two columns, alternating
	const leftColumn = $derived($connectedTrackers.filter((_, i) => i % 2 === 0));
	const rightColumn = $derived($connectedTrackers.filter((_, i) => i % 2 === 1));
	const statusLabel = $derived(
		$sessionState.status === "starting"
			? $t("home.starting")
			: $sessionState.status === "stopping"
				? $t("home.stopping")
				: $sessionState.status === "error"
					? $t("home.session_error")
					: $sessionState.status === "on"
						? $t("home.connected")
						: $t("home.disconnected"),
	);

	function toggleTracking() {
		if ($sessionState.status === "error" && !$sessionState.requestedEnabled) {
			void stopInterpreting().catch((err) => error(["backend"], `Failed to stop tracking: ${err}`));
			return;
		}
		isOn.update((on) => !on);
	}

	// expands every card, or collapses them all if any are open
	function toggleAll() {
		const anyOpen = Object.values($trackerOpenStates).some(Boolean);
		trackerOpenStates.update((states) => Object.fromEntries(Object.keys(states).map((id) => [id, !anyOpen])));

		requestAnimationFrame(() => {
			window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
		});
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
				<Button label={$t("home.settings.collapse_expand")} onClick={toggleAll} />
				<Button
					label={$t("home.settings.pairing")}
					icon="ri:bluetooth-connect-line"
					background="quaternary"
					onClick={() => goto("/trackers/pairing")}
				/>
			</div>
			<div class="flex flex-row items-center justify-evenly gap-2">
				<Switch label={$t("home.settings.precise_data")} bind:selected={$program.preciseData} />
				<Switch label={$t("home.settings.fast_data")} bind:selected={$program.fastData} />
				<Switch label="Show tracker visualization" bind:selected={$program.visualization} />
			</div>
		</div>
	</div>

	{#if $isOn}
		{#if $connectedTrackers.length === 0}
			<div class="rounded-lg bg-panel py-8 text-center">{$t("home.none")}</div>
		{:else}
			<!-- on mobile/small it needs to be one column -->
			{#if isSmall}
				<div class="flex flex-col gap-4">
					{#each $connectedTrackers as tracker (tracker.id)}
						<Card name={tracker.name} id={tracker.id} type={tracker.tracker_type} />
					{/each}
				</div>
			{:else}
				<div class="flex flex-row gap-4">
					<div class="flex flex-1 flex-col gap-4">
						{#each leftColumn as tracker (tracker.id)}
							<Card name={tracker.name} id={tracker.id} type={tracker.tracker_type} />
						{/each}
					</div>
					<div class="flex flex-1 flex-col gap-4">
						{#each rightColumn as tracker (tracker.id)}
							<Card name={tracker.name} id={tracker.id} type={tracker.tracker_type} />
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
		background:
			radial-gradient(ellipse 65% 120% at 0% 50%, #f05d38 0%, transparent 100%),
			radial-gradient(ellipse 75% 130% at 100% 0%, #9a48ee 0%, transparent 100%);
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
		background: linear-gradient(180deg, #f05d38 0%, #9a48ee 100%);
		mask:
			linear-gradient(#fff 0 0) content-box,
			linear-gradient(#fff 0 0);
		mask-composite: exclude;
	}
</style>
