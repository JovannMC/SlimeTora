<script lang="ts">
	import Button from "#lib/components/settings/Button.svelte";
	import { getBridge } from "#lib/api/bridge";
	import { appUpdate, checkUpdates, updateStatus } from "#lib/updates/index";
	import Icon from "@iconify/svelte";
	import { program } from "#lib/store/settings";
	import Checkbox from "#lib/components/settings/Checkbox.svelte";
	import Input from "#lib/components/settings/Input.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";
	import { changeLocale, locale, locales, t } from "#lib/lang/index";

	function statusIcon(status: string): string {
		if (status === "failed") return "ri:error-warning-line";
		if (status === "available" || status === "updated") return "ri:download-cloud-2-line";
		return "ri:checkbox-circle-line";
	}

	function statusClass(status: string): string {
		if (status === "failed") return "text-yellow-400";
		if (status === "available" || status === "updated") return "text-secondary-alt";
		return "text-green-400";
	}
</script>

<div class="rounded-lg bg-panel p-6 shadow">
	<h2 class="mb-6 flex items-center gap-2 font-heading text-2xl">
		<Icon icon="ri:settings-4-line" class="text-secondary" width={28} />
		{$t("settings.program.title")}
	</h2>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.program.behavior.name")}
				<Tooltip
					content={$t("settings.program.behavior.tooltip")}
					icon="ri:information-line"
					width="200px"
				/>
			</h3>
			<div class="flex flex-col gap-3 pl-1">
				<Checkbox label={$t("settings.program.behavior.start_connection.name")} bind:checked={$program.autoStart} />
				<Checkbox label={$t("settings.program.behavior.turn_off_trackers.name")} bind:checked={$program.autoOff} />
			</div>
			<Input
				label={$t("settings.program.behavior.visualization_fps.name")}
				type="number"
				bind:value={$program.visualizationFPS}
				icon="ri:timer-line"
				tooltip={$t("settings.program.visualization_fps.tooltip")}
				tooltipPosition="up"
				tooltipWidth="250px"
			/>

			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.program.appearance.name")}
				<Tooltip content={$t("settings.program.appearance.tooltip")} icon="ri:information-line" width="200px" />
			</h3>
			<Select
				label={$t("settings.program.appearance.theme.name")}
				options={[
					{ value: "default", label: "SlimeTora" },
					{ value: "v1", label: "SlimeTora v1 (legacy)" },
				]}
				bind:selected={$program.theme}
				icon="ri:palette-line"
			/>
			<Select
				label={$t("settings.program.appearance.language.name")}
				options={$locales.map((loc) => ({ value: loc, label: loc }))}
				selected={$locale}
				onChange={changeLocale}
				icon="ri:translate"
			/>
		</div>

		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.program.update_settings.name")}
				<Tooltip
					content={$t("settings.program.update_settings.tooltip")}
					icon="ri:information-line"
					width="220px"
				/>
			</h3>
			<div class="flex flex-col gap-3 pl-1">
				<Checkbox label={$t("settings.program.update_settings.app")} bind:checked={$program.checkUpdatesApp} />
				<Checkbox
					label={$t("settings.program.update_settings.language")}
					bind:checked={$program.checkUpdatesLanguage}
				/>
			</div>
			<Select
				label={$t("settings.program.update_settings.channel.name")}
				options={[
					{ value: "stable", label: $t("settings.program.update_settings.channel.stable") },
					{ value: "beta", label: $t("settings.program.update_settings.channel.beta") },
				]}
				bind:selected={$program.updateChannel}
				tooltip={$t("settings.program.update_settings.channel.tooltip")}
				tooltipPosition="up"
				tooltipWidth="250px"
			/>
			<Button
				label={$t("settings.program.update_settings.check")}
				icon={$updateStatus.checking ? "ri:loader-4-line" : "ri:refresh-line"}
				onClick={() => void checkUpdates($program.checkUpdatesApp, $program.checkUpdatesLanguage)}
				disabled={$updateStatus.checking || (!$program.checkUpdatesApp && !$program.checkUpdatesLanguage)}
				background="primary"
			/>

			{#if $updateStatus.checking}
				<p class="flex items-center gap-2 text-sm text-text-alt" aria-live="polite">
					<Icon icon="ri:loader-4-line" class="shrink-0 animate-spin" width={18} />
					{$t("settings.program.update_settings.checking")}
				</p>
			{:else if $updateStatus.app || $updateStatus.language}
				<div class="space-y-2 rounded-md bg-quaternary/60 p-3" aria-live="polite">
					{#if $updateStatus.app}
						<div class="flex items-start gap-2">
							<Icon
								icon={statusIcon($updateStatus.app)}
								class="mt-0.5 shrink-0 {statusClass($updateStatus.app)}"
								width={18}
							/>
							<span class="flex-1 text-sm">
								{$t(`settings.program.update_settings.app_${$updateStatus.app}`, {
									version: $appUpdate?.version ?? "",
								})}
							</span>
						</div>
					{/if}

					{#if $updateStatus.language}
						<div class="flex items-start gap-2">
							<Icon
								icon={statusIcon($updateStatus.language)}
								class="mt-0.5 shrink-0 {statusClass($updateStatus.language)}"
								width={18}
							/>
							<span class="text-sm">
								{$t(`settings.program.update_settings.language_${$updateStatus.language}`)}
							</span>
						</div>
					{/if}
				</div>

				{#if $appUpdate}
					<Button
						label={$t("settings.program.update_settings.open_download")}
						onClick={() => void getBridge().openRelease($appUpdate!.url)}
						icon="ri:external-link-line"
					/>
				{/if}
			{/if}
		</div>
	</div>
</div>
