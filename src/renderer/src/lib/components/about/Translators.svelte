<script lang="ts">
	import { t, translatorGroups } from "#lib/lang/index.js";
	import AboutSection from "./AboutSection.svelte";
</script>

<AboutSection icon="ri:translate-2" title={$t("about.translators")} panelClass="gap-5 text-text-alt">
	{#each $translatorGroups as group}
		<div>
			<h3 class="mb-2 font-heading text-base">{group.language}</h3>
			<div class="flex flex-wrap items-center gap-4 text-sm">
				{#each group.translators as c}
					<div class="flex items-center gap-2">
						{#if c.pfp}
							<a href={c.link} target="_blank" rel="noopener noreferrer">
								<img src={c.pfp} alt={c.name} class="h-5 w-5 rounded-full bg-black object-cover" />
							</a>
						{/if}
						<a href={c.link} target="_blank" rel="noopener noreferrer" class="hover:text-secondary-alt hover:underline">
							{c.name}
						</a>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</AboutSection>
