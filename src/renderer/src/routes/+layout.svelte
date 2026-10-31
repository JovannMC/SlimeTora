<script lang="ts">
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import { onNavigate } from "$app/navigation";
	import { OverlayScrollbars } from "overlayscrollbars";
	import "../app.css";
	import "@fontsource/chakra-petch";
	import "overlayscrollbars/overlayscrollbars.css";
	import Button from "#lib/components/settings/Button.svelte";
	import Toast from "#lib/components/Toast.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";
	import { ToastManager } from "#lib/util/toast.svelte";
	import { currentPath, isOn, trackersLoaded } from "#lib/store/index";
	import { initialized, initTranslations, t } from "#lib/lang/index";
	import { captureUncaughtErrors, error, info } from "#lib/log/index";
	import "#lib/api/icons";
	import { registerBridge } from "#lib/api/bridge";
	import { electronBridge } from "#lib/api/electronBridge";
	import { attachNotifications } from "#lib/backend/notifications";
	import { attachBackendState, backendStateLoaded } from "#lib/backend/state";
	import { attachBleTargets } from "#lib/backend/ble-targets";
	import { firstRun, program, restartRequired, settingsLoaded } from "#lib/store/settings";
	import { loadPlatform } from "#lib/store/platform";
	import { sessionState } from "#lib/backend/state";
	import { startInterpreting, stopInterpreting } from "#lib/backend/index";

	registerBridge(electronBridge);

	let { children } = $props();

	async function restartConnection() {
		if (!$isOn || $sessionState.status !== "on" || !$restartRequired) return;

		try {
			await stopInterpreting();
			await startInterpreting();
			restartRequired.set(false);
			info(["settings"], "Restarted tracking connection to apply settings");
		} catch (err) {
			error(["settings"], `Failed to restart tracking connection: ${err}`);
		}
	}

	onNavigate((event) => currentPath.set(event.to?.url.pathname ?? "/"));

	onMount(() => {
		const detachBackendState = attachBackendState();
		const detachBleTargets = attachBleTargets();
		const detachNotifications = attachNotifications();
		const stopCapture = captureUncaughtErrors();
		void loadPlatform();

		let disposed = false;

		currentPath.set(window.location.pathname);

		void Promise.all([backendStateLoaded(), settingsLoaded, trackersLoaded]).then(() => {
			if (disposed) return;
			if ($firstRun) {
				if (!window.location.pathname.startsWith("/onboarding")) goto("/onboarding");
				return;
			}
			if ($program.autoStart && $isOn === false) isOn.set(true);
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

{#if $isOn && $sessionState.status === "on" && $restartRequired}
	<div class="fixed right-6 bottom-6 z-50">
		<Tooltip content={$t("settings.restart")} position="left" width="280px">
			<Button icon="ri:restart-line" background="primary" rounded onClick={restartConnection} />
		</Tooltip>
	</div>
{/if}

<div class="fixed right-0 bottom-28 z-50 flex flex-col-reverse gap-4 p-4 md:bottom-0">
	{#each ToastManager.toasts as toast (toast.id)}
		<div class="flex justify-end">
			<Toast {toast} />
		</div>
	{/each}
</div>
