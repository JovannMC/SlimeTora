<script lang="ts">
	import { onMount } from "svelte";
	import Icon from "@iconify/svelte";
	import Button from "#lib/components/settings/Button.svelte";
	import Checkbox from "#lib/components/settings/Checkbox.svelte";
	import { getBridge, isBridgeAvailable } from "#lib/api/bridge";
	import { backendSnapshot } from "#lib/backend/state";
	import { t } from "#lib/lang/index";
	import { PRIVALYTICS_ORIGIN } from "$shared/consts";
	import type { AnalyticsPreview } from "$shared/ipc/channels";

	let analyticsEnabled = $state(true);
	let preferenceLoaded = $state(false);
	let showDetails = $state(false);
	let analyticsPreview = $state<AnalyticsPreview>();
	let previewLoading = $state(true);
	let previewRequest = 0;

	onMount(() => {
		if (!isBridgeAvailable()) {
			preferenceLoaded = true;
			return;
		}

		void getBridge()
			.getAnalyticsEnabled()
			.then((enabled) => (analyticsEnabled = enabled))
			.catch(() => undefined)
			.finally(() => (preferenceLoaded = true));
	});

	$effect(() => {
		const enabled = analyticsEnabled;
		if (preferenceLoaded && isBridgeAvailable()) void getBridge().setAnalyticsEnabled(enabled);
	});

	$effect(() => {
		$backendSnapshot.revision;
		const request = ++previewRequest;
		previewLoading = true;

		if (!isBridgeAvailable()) {
			analyticsPreview = undefined;
			previewLoading = false;
			return;
		}

		void getBridge()
			.getAnalyticsPreview()
			.then((preview) => {
				if (request === previewRequest) analyticsPreview = preview;
			})
			.catch(() => {
				if (request === previewRequest) analyticsPreview = undefined;
			})
			.finally(() => {
				if (request === previewRequest) previewLoading = false;
			});
	});
</script>

<div class="rounded-lg bg-panel p-6 shadow">
	<h2 class="mb-6 flex items-center gap-2 font-heading text-2xl">
		<Icon icon="ri:bar-chart-box-line" class="text-secondary" width={28} />
		{$t("settings.analytics.title")}
	</h2>

	<div class="flex flex-col gap-4">
		<p class="text-sm text-text-alt">{$t("settings.analytics.description")}</p>
		<div class="flex flex-col gap-3 pl-1">
			<Checkbox label={$t("settings.analytics.enabled")} bind:checked={analyticsEnabled} />
		</div>
		<div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
			<Button
				label={showDetails ? $t("settings.analytics.hide_details") : $t("settings.analytics.show_details")}
				icon={showDetails ? "ri:eye-off-line" : "ri:information-line"}
				background="quaternary"
				onClick={() => (showDetails = !showDetails)}
			/>
			<a
				class="flex items-center justify-center gap-2 rounded-md bg-quaternary px-4 py-2 transition-colors hover:bg-tertiary/60 active:bg-tertiary/30"
				href={`${PRIVALYTICS_ORIGIN}/projects/slimetora`}
				target="_blank"
				rel="noreferrer"
			>
				<Icon icon="ri:external-link-line" width={18} />
				<span>{$t("settings.analytics.dashboard")}</span>
			</a>
		</div>
		{#if showDetails}
			<div class="rounded-md bg-quaternary/60 p-4 text-sm" aria-live="polite">
				<p class="mb-2 font-medium">{$t("settings.analytics.payload_title")}</p>
				<ul class="list-inside list-disc space-y-1 text-text-alt">
					<li>
						{$t("settings.analytics.payload_version", {
							value: JSON.stringify(analyticsPreview?.appVersion ?? "…"),
						})}
					</li>
					<li>
						{$t("settings.analytics.payload_os", {
							value: JSON.stringify(analyticsPreview?.operatingSystem ?? "…"),
						})}
					</li>
					<li>
						{$t("settings.analytics.payload_count", {
							value: JSON.stringify(analyticsPreview?.trackerCount ?? "…"),
						})}
					</li>
					<li>
						{$t("settings.analytics.payload_model", {
							value: JSON.stringify(
								analyticsPreview?.trackerModel ?? $t("settings.analytics.unavailable"),
							),
						})}
					</li>
					<li>
						{$t("settings.analytics.payload_mode", {
							value: JSON.stringify(
								analyticsPreview?.connectionMode ?? $t("settings.analytics.unavailable"),
							),
						})}
					</li>
					<li>{$t("settings.analytics.payload_id")}</li>
				</ul>
				<p class="mt-3 text-text-alt">{$t("settings.analytics.payload_frequency")}</p>
			</div>
		{/if}
	</div>
</div>
