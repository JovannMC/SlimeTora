<script lang="ts">
	import Icon from "@iconify/svelte";
	import { currentPath, externalNavLinks, navLinks } from "#lib/store/index";
	import { t } from "#lib/lang/index";
</script>

<nav class="fixed top-16 flex h-[calc(100vh-64px)] w-16 flex-col justify-between bg-panel drop-shadow-xl">
	<div>
		{#each navLinks as { icon, active, label, link }}
			{@const selected = $currentPath === link}
			<a href={link} class="link" class:selected aria-label={$t(label)} title={$t(label)}>
				<Icon class={selected ? "text-white" : "text-text-alt"} icon={selected ? active : icon} width={28} />
			</a>
		{/each}
	</div>

	<div>
		{#each externalNavLinks as { icon, link }}
			<a href={link} target="_blank" rel="noopener noreferrer" class="link">
				<Icon class="text-text-alt" {icon} width={28} />
			</a>
		{/each}
	</div>
</nav>

<style>
	@reference "../../../app.css";

	.link {
		@apply flex h-16 flex-col items-center justify-center;
	}

	.link:hover {
		@apply bg-secondary/12;
	}

	.link:active {
		@apply bg-secondary/6;
	}

	.link.selected {
		@apply border-r-2 border-secondary bg-secondary/24 pl-0.5;
	}
</style>
