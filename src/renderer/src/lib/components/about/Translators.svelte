<script lang="ts">
	import { t } from "#lib/lang/index.js";
	import AboutSection from "./AboutSection.svelte";

	// TODO: dynamically load translators by including "credits" line in translation files, including name, pfp (GH profile link), and links
	let {
		translators,
	}: {
		translators: { language: string; contributors: { name: string; pfp: string; link: string }[] }[];
	} = $props();
</script>

<AboutSection icon="ri:translate-2" title={$t("about.translators")} panelClass="gap-5 text-text-alt">
	{#each translators as translator}
		<div>
			<h3 class="mb-2 font-heading text-base">{translator.language}</h3>
			<div class="flex flex-wrap items-center gap-4 text-sm">
				{#each translator.contributors as c}
					<div class="flex items-center gap-2">
						<a href={c.link} target="_blank" rel="noopener noreferrer">
							<img src={c.pfp} alt={c.name} class="h-5 w-5 rounded-full bg-black object-cover" />
						</a>
						<a
							href={c.link}
							target="_blank"
							rel="noopener noreferrer"
							class="hover:text-secondary-alt hover:underline"
						>
							{c.name}
						</a>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</AboutSection>
