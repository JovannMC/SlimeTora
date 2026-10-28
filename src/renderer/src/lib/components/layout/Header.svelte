<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";
	import { currentPath, navLinks } from "#lib/store/index.js";
	import { t } from "#lib/lang/index.js";
	import { getBridge } from "#lib/api/bridge.js";
	import { error } from "#lib/log/index.js";

	let appVersion = $state("0.0.0");
	const currentNavLink = $derived(navLinks.find((link) => link.link === $currentPath));

	onMount(async () => {
		try {
			appVersion = (await getBridge().getAppInfo()).version;
		} catch (err) {
			error("Failed to fetch app version:", err);
		}
	});
</script>

<div class="fixed z-10 h-16 w-full bg-panel drop-shadow-xl">
	<div class="flex h-full items-center justify-between px-3">
		<div class="flex flex-row items-center gap-2">
			<img src="/logo.png" alt="Logo" class="w-10 rounded-md" />
			<h1 class="text-xl font-bold">SlimeTora <span class="text-xs text-text-alt">v{appVersion}</span></h1>
		</div>
		<div class="flex flex-row items-center gap-2 pr-1">
			{#if currentNavLink}
				<Icon icon={currentNavLink.active} width={20} />
				<p class="text-xl">{$t(currentNavLink.label)}</p>
			{/if}
		</div>
	</div>
</div>
