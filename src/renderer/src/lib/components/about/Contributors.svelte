<script lang="ts">
	import Icon from "@iconify/svelte";
	import { t } from "#lib/lang/index.js";
	import AboutSection from "./AboutSection.svelte";

	type Contributor = {
		pfp: string;
		name: string;
		byline: string;
		links: { icon: string; url: string }[];
	};

	let { contributors }: { contributors: Contributor[] } = $props();
</script>

<AboutSection icon="ri:id-card-line" title={$t("about.contributors.title")}>
	{#each contributors as c}
		<div class="flex items-center gap-3">
			<img src={c.pfp} alt={c.name} class="h-10 w-10 rounded-full bg-black object-cover" />
			<div>
				<p class="flex items-center gap-1 font-heading text-base">
					{c.name}
					{#each c.links as link}
						<a href={link.url} target="_blank" rel="noopener noreferrer">
							<Icon icon={link.icon} class="text-text-alt hover:text-secondary-alt" width={16} />
						</a>
					{/each}
				</p>
				<p class="text-sm text-text-alt">{$t(c.byline)}</p>
			</div>
		</div>
	{/each}
</AboutSection>
