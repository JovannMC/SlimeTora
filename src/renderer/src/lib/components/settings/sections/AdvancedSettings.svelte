<script lang="ts">
	import Icon from "@iconify/svelte";
	import { goto } from "$app/navigation";
	import { invoke } from "#lib/api/backend.js";
	import { error } from "#lib/log/index.js";
	import { advanced, type LoggingMode } from "#lib/store/settings.js";
	import { t } from "#lib/lang/index.js";
	import Button from "#lib/components/settings/Button.svelte";
	import Checkbox from "#lib/components/settings/Checkbox.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";

	async function openLogsFolder() {
		try {
			await invoke("open_logs_folder");
		} catch (err) {
			error("Failed to open logs folder:", err);
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
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.advanced.serial_settings.name")}
				<Tooltip
					content={$t("settings.advanced.serial_settings.tooltip")}
					icon="ri:information-line"
					position="up"
				/>
			</h3>
			<div class="flex flex-col gap-3 pl-1">
				<Checkbox
					label={$t("settings.advanced.bypass_serial_limit.name")}
					bind:checked={$advanced.bypassSerialLimit}
					tooltip={$t("settings.advanced.bypass_serial_limit.tooltip")}
					tooltipPosition="up"
					tooltipWidth="250px"
				/>
			</div>

			<Button
				label={$t("home.onboarding")}
				icon="ri:question-answer-line"
				background="quaternary"
				onClick={() => goto("/onboarding")}
			/>
		</div>

		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.advanced.logging.name")}
				<Tooltip content={$t("settings.advanced.logging.tooltip")} icon="ri:information-line" position="up" />
			</h3>
			<div class="flex flex-col gap-3 pl-1">
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
				<div class="mt-2">
					<Button
						label={$t("settings.advanced.open_logs_folder.name")}
						icon="ri:folder-open-line"
						background="quaternary"
						onClick={openLogsFolder}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
