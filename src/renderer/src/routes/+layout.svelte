<script lang="ts">
	import { onMount } from "svelte";
	import { onNavigate } from "$app/navigation";
	import { OverlayScrollbars } from "overlayscrollbars";
	import "../app.css";
	import "@fontsource/chakra-petch";
	import "overlayscrollbars/overlayscrollbars.css";
	import Toast from "#lib/components/Toast.svelte";
	import { ToastManager } from "#lib/util/toast.svelte";
	import { currentPath } from "#lib/store/index";
	import { initialized, initTranslations } from "#lib/lang/index";
	import { invoke } from "#lib/api/backend";
	import { captureUncaughtErrors, error } from "#lib/log/index";
	import "#lib/api/icons";
	import { registerBridge } from "#lib/api/bridge";
	import { electronBridge } from "#lib/api/electronBridge";

	registerBridge(electronBridge);

	let { children } = $props();

	onNavigate((event) => currentPath.set(event.to?.url.pathname ?? "/"));

	onMount(async () => {
		currentPath.set(window.location.pathname);
		captureUncaughtErrors();

		if (!$initialized) await initTranslations("en");

		OverlayScrollbars(document.body, {
			scrollbars: { autoHide: "leave", autoHideDelay: 100, visibility: "auto", theme: "os-theme-dark" },
		});

		window.addEventListener("beforeunload", async () => {
			try {
				await invoke("cleanup_connections");
			} catch (err) {
				error(["layout"], `Failed to cleanup backend connections: ${err}`);
			}
		});
	});
</script>

{@render children()}

<div class="fixed right-0 bottom-28 z-50 flex flex-col-reverse gap-4 p-4 md:bottom-0">
	{#each ToastManager.toasts as toast (toast.id)}
		<div class="flex justify-end">
			<Toast {toast} />
		</div>
	{/each}
</div>
