<script lang="ts">
	import Icon from "@iconify/svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { connection } from "#lib/store/settings";
	import { ConnectionMode } from "#lib/types/connection";
	import { TrackerModel } from "#lib/types/tracker";
	import { invoke } from "#lib/api/backend";
	import { error, info, warn } from "#lib/log/index";
	import { t } from "#lib/lang/index";
	import Button from "#lib/components/settings/Button.svelte";
	import Checkbox from "#lib/components/settings/Checkbox.svelte";
	import Input from "#lib/components/settings/Input.svelte";
	import Switch from "#lib/components/settings/Switch.svelte";
	import Tooltip from "#lib/components/settings/Tooltip.svelte";

	const MODELS = [
		{ model: TrackerModel.Wireless, label: "HaritoraX Wireless / 2" },
		{ model: TrackerModel.Wired, label: "HaritoraX 1.1b/1.1/1.0" },
	];

	const MODES = [
		{ mode: ConnectionMode.BLE, label: "Bluetooth (LE)" },
		{ mode: ConnectionMode.Serial, label: "Serial / GX(6/2)" },
	];

	// serial endpoints the library can see: GX dongles and wired trackers
	let availablePorts: string[] = $state([]);

	async function refreshPorts() {
		try {
			const endpoints = await invoke("discover");
			availablePorts = endpoints
				.filter((endpoint) => endpoint.connection === "serial")
				.map((endpoint) => endpoint.id)
				.sort();
			info(["settings", "connection"], `Found serial ports: ${availablePorts}`);
		} catch (err) {
			warn(["settings", "connection"], `Error refreshing ports: ${err}`);
		}
	}

	onMount(() => {
		void refreshPorts();
	});

	// keeps the order of `order`, so the stored lists are always in a stable order
	function toggleListed<T>(current: T[], item: T, on: boolean, order: T[]): T[] {
		return order.filter((value) => (value === item ? on : current.includes(value)));
	}

	function setModel(model: TrackerModel, on: boolean) {
		connection.update((s) => ({
			...s,
			models: toggleListed(
				s.models,
				model,
				on,
				MODELS.map((m) => m.model),
			),
		}));
	}

	function setMode(mode: ConnectionMode, on: boolean) {
		connection.update((s) => ({
			...s,
			modes: toggleListed(
				s.modes,
				mode,
				on,
				MODES.map((m) => m.mode),
			),
		}));
	}

	function setPort(port: string, on: boolean) {
		connection.update((s) => ({ ...s, ports: toggleListed(s.ports, port, on, availablePorts) }));
	}
</script>

<div class="rounded-lg bg-panel p-6 shadow">
	<h2 class="mb-6 flex items-center gap-2 font-heading text-2xl">
		<Icon icon="ri:link" class="text-secondary" width={28} />
		{$t("settings.connection.title")}
	</h2>

	<div class="grid grid-cols-1 gap-8 md:grid-cols-2">
		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.connection.tracker_model.name")}
				<Tooltip
					content={$t("settings.connection.tracker_model.tooltip")}
					icon="ri:information-line"
					width="250px"
				/>
			</h3>
			<div class="flex flex-col gap-3 pl-1">
				{#each MODELS as { model, label }}
					<Checkbox
						{label}
						bind:checked={() => $connection.models.includes(model), (on) => setModel(model, on)}
					/>
				{/each}
			</div>

			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.connection.connection_mode.name")}
				<Tooltip
					content={$t("settings.connection.connection_mode.tooltip")}
					icon="ri:information-line"
					width="250px"
				/>
			</h3>
			<div class="flex flex-col gap-3 pl-1">
				{#each MODES as { mode, label }}
					<Checkbox
						{label}
						bind:checked={() => $connection.modes.includes(mode), (on) => setMode(mode, on)}
					/>
				{/each}
			</div>

			<Button
				label={$t("home.settings.pairing")}
				icon="ri:bluetooth-connect-line"
				background="quaternary"
				onClick={() => goto("/trackers/pairing")}
			/>
		</div>

		<div class="flex flex-col gap-4">
			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.connection.serial_ports.name")}
				<Tooltip
					content={$t("settings.connection.serial_ports.tooltip")}
					icon="ri:information-line"
					width="250px"
				/>
			</h3>
			<div class="mb-2 flex items-center gap-2">
				<Button
					label={$t("settings.connection.serial_ports.refresh")}
					icon="ri:refresh-line"
					background="secondary"
					className="h-8 px-3 text-xs"
					onClick={refreshPorts}
				/>
			</div>
			{#if availablePorts.length > 0}
				<div class="grid grid-cols-2 gap-3 pl-1">
					{#each availablePorts as port (port)}
						<Switch
							label={port}
							bind:selected={() => $connection.ports.includes(port), (on) => setPort(port, on)}
						/>
					{/each}
				</div>
			{:else}
				<p class="text-text-alt italic">{$t("settings.connection.serial_ports.none")}</p>
			{/if}

			<h3 class="flex items-center gap-2 border-b border-secondary/50 pb-2 font-heading text-lg">
				{$t("settings.connection.slimevr_server.name")}
				<Tooltip
					content={$t("settings.connection.slimevr_server.tooltip")}
					icon="ri:information-line"
					width="300px"
				/>
			</h3>
			<div class="grid grid-cols-3 gap-4">
				<div class="col-span-2">
					<Input
						label={$t("settings.connection.server_ip")}
						icon="ri:global-line"
						placeholder="255.255.255.255"
						bind:value={$connection.slimevr.ip}
					/>
				</div>
				<div>
					<Input
						label={$t("settings.connection.server_port")}
						type="number"
						icon="ri:door-line"
						placeholder="6969"
						bind:value={$connection.slimevr.port}
					/>
				</div>
			</div>
		</div>
	</div>
</div>
