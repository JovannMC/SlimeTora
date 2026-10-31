<script lang="ts">
	import Icon from "@iconify/svelte";
	import { goto } from "$app/navigation";
	import { getBridge, isBridgeAvailable } from "#lib/api/bridge";
	import { error } from "#lib/log/index";
	import { advanced, type LoggingMode } from "#lib/store/settings";
	import { t } from "#lib/lang/index";
	import Button from "#lib/components/settings/Button.svelte";
	import Checkbox from "#lib/components/settings/Checkbox.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";

	async function openLogsFolder() {
		try {
			if (!isBridgeAvailable()) throw new Error("the Electron main process is not available");
			await getBridge().openLogsFolder();
		} catch (err) {
			error(["settings", "advanced"], "Failed to open logs folder:", err);
		}
	}

	async function openDataFolder() {
		try {
			if (!isBridgeAvailable()) throw new Error("the Electron main process is not available");
			await getBridge().openDataFolder();
		} catch (err) {
			error(["settings", "advanced"], "Failed to open data folder:", err);
		}
	}

	function setLoggingMode(value: string) {
		advanced.update((s) => ({ ...s, loggingMode: value as LoggingMode }));
	}
</script>

<div class="rounded-lg bg-panel p-6 shadow">
	<h2 class="mb-6 flex items-center gap-2 font-heading text-2xl">
		<Icon icon="ri:tools-line" class="text-secondary" width={28} />
		{$t("settings.advanced.title")}
	</h2>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div class="flex flex-col gap-4">
			<div class="flex flex-col gap-3 pl-1">
				<Checkbox
					label={$t("settings.advanced.show_all_ports.name")}
					bind:checked={$advanced.showAllSerialPorts}
					tooltip={$t("settings.advanced.show_all_ports.tooltip")}
					tooltipPosition="up"
					tooltipWidth="250px"
				/>
				<Checkbox
					label={$t("settings.advanced.write_logs.name")}
					bind:checked={$advanced.writeLogs}
					tooltip={$t("settings.advanced.write_logs.tooltip")}
					tooltipPosition="up"
					tooltipWidth="250px"
				/>
				<Select
					label={$t("settings.advanced.logging_mode.name")}
					options={[
						{ value: "minimal", label: $t("settings.advanced.logging_mode.minimal") },
						{ value: "debug", label: $t("settings.advanced.logging_mode.debug") },
						{ value: "all", label: $t("settings.advanced.logging_mode.all") },
					]}
					selected={$advanced.loggingMode}
					onChange={setLoggingMode}
					tooltip={$t("settings.advanced.logging_mode.tooltip")}
					tooltipPosition="up"
					tooltipWidth="250px"
				/>
			</div>
		</div>
		<div class="flex flex-col gap-4">
			<Button
				label={$t("settings.advanced.open_data.name")}
				icon="ri:folder-open-line"
				background="quaternary"
				onClick={openDataFolder}
			/>

			<Button
				label={$t("settings.advanced.open_logs.name")}
				icon="ri:file-list-2-line"
				background="quaternary"
				onClick={openLogsFolder}
			/>

			<Button
				label={$t("home.onboarding")}
				icon="ri:question-answer-line"
				background="quaternary"
				onClick={() => goto("/onboarding")}
			/>
		</div>
	</div>
</div>
