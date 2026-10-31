<script lang="ts">
	import Icon from "@iconify/svelte";
	import { program } from "#lib/store/settings";
	import Checkbox from "#lib/components/settings/Checkbox.svelte";
	import Input from "#lib/components/settings/Input.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";
	import { changeLocale, locale, locales, t } from "#lib/lang/index";
</script>

<div class="rounded-lg bg-panel p-6 shadow">
	<h2 class="mb-6 flex items-center gap-2 font-heading text-2xl">
		<Icon icon="ri:settings-4-line" class="text-secondary" width={28} />
		{$t("settings.program.title")}
	</h2>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.program.app_behavior.name")}
				<Tooltip
					content={$t("settings.program.app_behavior.tooltip")}
					icon="ri:information-line"
					width="200px"
				/>
			</h3>
			<div class="flex flex-col gap-3 pl-1">
				<Checkbox label={$t("settings.program.start_connection.name")} bind:checked={$program.autoStart} />
				<Checkbox label={$t("settings.program.turn_off_trackers.name")} bind:checked={$program.autoOff} />
			</div>
			<Input
				label={$t("settings.program.visualization_fps.name")}
				type="number"
				bind:value={$program.visualizationFPS}
				icon="ri:timer-line"
				tooltip={$t("settings.program.visualization_fps.tooltip")}
				tooltipPosition="up"
				tooltipWidth="250px"
			/>
			<Select
				label={$t("settings.program.language.name")}
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
		</div>
	</div>
</div>
