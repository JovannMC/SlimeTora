<script lang="ts">
	import { onMount } from "svelte";
	import { onNavigate } from "$app/navigation";
	import { OverlayScrollbars } from "overlayscrollbars";
	import "../app.css";
	import "@fontsource/chakra-petch";
	import "overlayscrollbars/overlayscrollbars.css";
	import Toast from "#lib/components/Toast.svelte";
	import { ToastManager } from "#lib/util/toast.svelte";
	import { currentPath, isOn, trackersLoaded } from "#lib/store/index";
	import { initialized, initTranslations } from "#lib/lang/index";
	import { captureUncaughtErrors, error } from "#lib/log/index";
	import "#lib/api/icons";
	import { registerBridge } from "#lib/api/bridge";
	import { electronBridge } from "#lib/api/electronBridge";
	import { attachNotifications } from "#lib/backend/notifications";
	import { attachBackendState, backendStateLoaded } from "#lib/backend/state";
	import { attachBleTargets } from "#lib/backend/ble-targets";
	import { program, settingsLoaded } from "#lib/store/settings";

	registerBridge(electronBridge);

	let { children } = $props();

	onNavigate((event) => currentPath.set(event.to?.url.pathname ?? "/"));

	onMount(() => {
		const detachBackendState = attachBackendState();
		const detachBleTargets = attachBleTargets();
		const detachNotifications = attachNotifications();
		const stopCapture = captureUncaughtErrors();

		let disposed = false;

		currentPath.set(window.location.pathname);

		void Promise.all([backendStateLoaded(), settingsLoaded, trackersLoaded]).then(() => {
			if (!disposed && $program.autoStart && $isOn === false) isOn.set(true);
		});

		if (!$initialized) void initTranslations("en");

		const scrollbars = OverlayScrollbars(document.body, {
			scrollbars: { autoHide: "leave", autoHideDelay: 100, visibility: "auto", theme: "os-theme-dark" },
		});

		return () => {
			disposed = true;
			detachBackendState();
			detachBleTargets();
			detachNotifications();
			stopCapture();
			scrollbars?.destroy();
		};
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
