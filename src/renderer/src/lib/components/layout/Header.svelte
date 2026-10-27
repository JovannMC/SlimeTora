<script lang="ts">
	import { currentPath, navLinks } from "#lib/store/index.js";
	import Icon from "@iconify/svelte";
	import { getBridge } from "#lib/api/bridge.js";
	import { onMount } from "svelte";
	import { error } from "#lib/log/index.js";

	let appVersion = $state("0.0.0");
	let path = $currentPath;
	let currentNavLink = $state({ name: "", icon: "" });

	currentPath.subscribe((value) => {
		path = value;
		currentNavLink = navLinks.find((link) => link.link === path) || { name: "", icon: "" };
	});

	onMount(async () => {
		try {
			appVersion = (await getBridge().getAppInfo()).version;
		} catch (err) {
			error("Failed to fetch app version:", err);
		}
	});
</script>

<div class="fixed w-full h-16 bg-panel drop-shadow-xl z-10">
	<div class="flex items-center justify-between h-full px-3">
		<div class="flex flex-row items-center gap-2">
			<img src="/logo.png" alt="Logo" class="w-10 rounded-md" />
			<h1 class="text-xl font-bold">SlimeTora <span class="text-xs text-text-alt">v{appVersion}</span></h1>
		</div>
		<div class="flex flex-row items-center gap-2 pr-1">
			<Icon icon={currentNavLink.icon} width={20} />
			<p class="text-xl">{currentNavLink.name}</p>
		</div>
	</div>
</div>
