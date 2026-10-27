<script lang="ts">
	import { goto } from "$app/navigation";
	import Button from "#lib/components/settings/Button.svelte";
	import Switch from "#lib/components/settings/Switch.svelte";
	import Card from "#lib/components/trackers/Card.svelte";
	import { t } from "#lib/lang/index.js";
	import { trackerOpenStates, connectedTrackers } from "#lib/store/index.js";
	import { program } from "#lib/store/settings.js";

	const leftColumn = $derived($connectedTrackers.filter((_, i) => i % 2 === 0));
	const rightColumn = $derived($connectedTrackers.filter((_, i) => i % 2 === 1));

	function toggleAll() {
		const anyOpen = Object.values($trackerOpenStates).some(Boolean);
		trackerOpenStates.update((states) => Object.fromEntries(Object.keys(states).map((id) => [id, !anyOpen])));

		setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }), 0);
	}
</script>

<div class="flex flex-col p-4">
	{#if $connectedTrackers.length === 0}
		<div class="rounded-lg bg-panel py-8 text-center">{$t("trackers.none")}</div>
	{:else}
		<div class="flex flex-row gap-x-4">
			<div class="flex flex-1 flex-col gap-y-4">
				{#each leftColumn as tracker (tracker.id)}
					<Card name={tracker.name} id={tracker.id} type={tracker.tracker_type} />
				{/each}
			</div>
			<div class="flex flex-1 flex-col gap-y-4">
				{#each rightColumn as tracker (tracker.id)}
					<Card name={tracker.name} id={tracker.id} type={tracker.tracker_type} />
				{/each}
			</div>
		</div>
	{/if}

	<div class="mt-8 w-full rounded-lg bg-panel p-6 shadow">
		<h2 class="mb-4 text-lg font-semibold">{$t("trackers.settings.title")}</h2>
		<div class="flex flex-col gap-4">
			<div class="flex flex-row gap-2">
				<Button label={$t("trackers.settings.collapse_expand")} onClick={toggleAll} />
				<Button
					label={$t("trackers.settings.pairing")}
					icon="ri:bluetooth-connect-line"
					background="quaternary"
					onClick={() => goto("/trackers/pairing")}
				/>
			</div>
			<div class="flex flex-row items-center justify-evenly gap-2">
				<Switch label={$t("trackers.settings.precise_data")} bind:selected={$program.preciseData} />
				<Switch label={$t("trackers.settings.fast_data")} bind:selected={$program.fastData} />
				<Switch label="Show tracker visualization" bind:selected={$program.visualization} />
			</div>
		</div>
	</div>
</div>
