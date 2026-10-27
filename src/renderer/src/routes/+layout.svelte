<script lang="ts">
	import { onMount } from "svelte";
	import { onNavigate } from "$app/navigation";
	import { OverlayScrollbars } from "overlayscrollbars";
	import "../app.css";
	import "@fontsource/chakra-petch";
	import "overlayscrollbars/overlayscrollbars.css";
	import Toast from "#lib/components/Toast.svelte";
	import { toasts } from "#lib/store/ToastProvider.js";
	import { currentPath } from "#lib/store/index.js";
	import { initialized, initTranslations } from "#lib/lang/index.js";
	import { invoke } from "#lib/api/backend.js";
	import "#lib/api/icons.js";
	import { registerBridge } from "#lib/api/bridge.js";
	import { electronBridge } from "#lib/api/electronBridge.js";

	registerBridge(electronBridge);

	let { children } = $props();

	onNavigate((event) => currentPath.set(event.to?.url.pathname ?? "/"));

	onMount(async () => {
		currentPath.set(window.location.pathname);

		if (!$initialized) await initTranslations("en");

		OverlayScrollbars(document.body, {
			scrollbars: { autoHide: "leave", autoHideDelay: 100, visibility: "auto", theme: "os-theme-dark" },
		});

		window.addEventListener("beforeunload", async () => {
			try {
				await invoke("cleanup_connections");
			} catch (err) {
				console.error(`Failed to cleanup backend connections: ${err}`);
			}
		});
	});
</script>

{@render children()}

<div class="fixed right-0 bottom-28 z-50 flex flex-col-reverse gap-4 p-4 md:bottom-0">
	{#each $toasts as toast (toast.id)}
		<div class="flex justify-end">
			<Toast id={toast.id} type={toast.type} message={toast.message} durations={toast.durations} />
		</div>
	{/each}
</div>
