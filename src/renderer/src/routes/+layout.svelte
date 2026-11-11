<script lang="ts">
	import { goto } from "$app/navigation";
	import { onMount } from "svelte";
	import { get } from "svelte/store";
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
	import { checkUpdates, appUpdate } from "#lib/updates/index";
	import { initialized, initTranslations, t } from "#lib/lang/index";
	import { captureUncaughtErrors, error, info, setLoggingMode } from "#lib/log/index";
	import "#lib/api/icons";
	import { getBridge, registerBridge } from "#lib/api/bridge";
	import { electronBridge } from "#lib/api/electronBridge";
	import { attachNotifications } from "#lib/backend/notifications";
	import { attachMotionVisibility } from "#lib/backend/motion-visibility";
	import { attachBackendState, backendStateLoaded } from "#lib/backend/state";
	import { attachBleTargets } from "#lib/backend/ble-targets";
	import {
		advanced,
		customThemes,
		firstRun,
		program,
		restartRequired,
		settingsLoaded,
		settingsFileErrors,
	} from "#lib/store/settings";
	import { loadPlatform } from "#lib/store/platform";
	import { sessionState } from "#lib/backend/state";
	import { startInterpreting, stopInterpreting } from "#lib/backend/index";

	registerBridge(electronBridge);

	let { children } = $props();

	async function restartConnection() {
		if (!$isOn || $sessionState.status !== "on" || !$restartRequired) return;

		try {
			await stopInterpreting();
			if (!(await startInterpreting())) return;

			restartRequired.set(false);
			info(["settings"], "Restarted tracking connection to apply settings");
		} catch (err) {
			error(["settings"], `Failed to restart tracking connection: ${err}`);
		}
	}

	onNavigate((event) => currentPath.set(event.to?.url.pathname ?? "/"));

	onMount(() => {
		const customThemeStyle = document.createElement("style");
		customThemeStyle.dataset.customThemes = "true";
		document.head.append(customThemeStyle);

		const applyTheme = (theme: string) => {
			document.documentElement.dataset.theme = theme || "default";
			const customTheme = get(customThemes).find((entry) => entry.id === theme);
			customThemeStyle.textContent = customTheme
				? `:root[data-theme="${customTheme.id}"] {\n${customTheme.css}\n}`
				: "";
		};
		const stopTheme = program.subscribe((settings) => applyTheme(settings.theme));
		const stopCustomThemes = customThemes.subscribe(() => applyTheme(get(program).theme));
		void (async () => {
			try {
				customThemes.set(await getBridge().getCustomThemes());
			} catch (err) {
				error(["themes"], `Failed to load custom themes: ${err}`);
			}
		})();

		const detachBackendState = attachBackendState();
		const detachBleTargets = attachBleTargets();
		const detachNotifications = attachNotifications();
		const detachMotionVisibility = attachMotionVisibility();
		const stopCapture = captureUncaughtErrors();
		const stopLoggingSettings = advanced.subscribe((settings) => setLoggingMode(settings.loggingMode));
		void loadPlatform();

		let disposed = false;
		let shownFileErrors = 0;

		const showFileErrors = () => {
			if (!get(initialized)) return;
			const errors = get(settingsFileErrors);
			for (const item of errors.slice(shownFileErrors)) {
				ToastManager.add({
					type: "error",
					message: get(t)(`settings.file.${item.kind}_failed`, { error: item.detail }),
				});
			}
			shownFileErrors = errors.length;
		};
		const stopFileErrors = settingsFileErrors.subscribe(showFileErrors);

		currentPath.set(window.location.pathname);

		void settingsLoaded.then(async () => {
			if (disposed) return;

			if (!$initialized) await initTranslations($program.locale);
			showFileErrors();

			const settings = get(program);
			void checkUpdates(settings.checkUpdatesApp, settings.checkUpdatesLanguage).then(() => {
				if (!disposed && get(appUpdate))
					ToastManager.add({
						type: "info",
						message: get(t)("settings.program.update_settings.app_available_toast", {
							version: get(appUpdate)?.version ?? "",
						}),
					});
			});
		});

		void Promise.all([backendStateLoaded(), settingsLoaded, trackersLoaded]).then(async () => {
			if (disposed) return;
			if ($firstRun) {
				if (!window.location.pathname.startsWith("/onboarding")) goto("/onboarding");
				return;
			}
			if ($program.autoStart && $isOn === false) isOn.set(true);
		});

		const scrollbars = OverlayScrollbars(document.body, {
			update: {
				ignoreMutation: ({ target, type }) => type === "characterData" && target.parentElement?.id === "imu",
			},
			scrollbars: { autoHide: "leave", autoHideDelay: 100, visibility: "auto", theme: "os-theme-dark" },
		});

		return () => {
			stopTheme();
			stopCustomThemes();
			customThemeStyle.remove();

			disposed = true;

			detachBackendState();
			detachBleTargets();
			detachNotifications();
			detachMotionVisibility();
			stopFileErrors();
			stopCapture();
			stopLoggingSettings();
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

<div class="fixed right-0 bottom-0 z-50 flex flex-col-reverse gap-4 p-4">
	{#each ToastManager.toasts as toast (toast.id)}
		<div class="flex justify-end">
			<Toast {toast} />
		</div>
	{/each}
</div>
