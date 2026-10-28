<script lang="ts">
	import { t } from "#lib/lang/index";
	import AboutSection from "./AboutSection.svelte";

	let { others }: { others: { name: string; link: string; author?: string }[] } = $props();
</script>

<AboutSection icon="ri:instance-line" title={$t("about.other_credits")} panelClass="gap-1 text-sm">
	{#each others as o}
		<p>
			<a href={o.link} target="_blank" rel="noopener noreferrer" class="text-secondary-alt hover:underline"
				>{o.name}</a
			>
			{#if o.author}
				<span class="text-text-alt"> by {o.author}</span>
			{/if}
		</p>
	{/each}
</AboutSection>
