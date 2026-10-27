<script lang="ts">
	import { t } from "#lib/lang/index.js";
	import AboutSection from "./AboutSection.svelte";

	let { ghContribs }: { ghContribs: { name: string; link: string; pfp: string }[] } = $props();
</script>

<AboutSection icon="ri:github-line" title={$t("about.gh_contributors")}>
	{#each ghContribs as c}
		<div class="flex items-center gap-3">
			<a href={c.link} target="_blank" rel="noopener noreferrer">
				<img src={c.pfp} alt={c.name} class="h-8 w-8 rounded-full bg-black object-cover" />
			</a>
			<a href={c.link} target="_blank" rel="noopener noreferrer" class="font-heading text-base hover:underline">
				{c.name}
			</a>
		</div>
	{/each}
</AboutSection>
