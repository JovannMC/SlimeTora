<script lang="ts">
	import Icon from "@iconify/svelte";
	import { t } from "#lib/lang/index";
	import Button from "#lib/components/settings/Button.svelte";
	import type { PairedDevice, TrackerDevice } from "./types";

	let {
		pairedDevices,
		discoveredDevices,
		isScanning,
		enabled,
		onToggleScan,
		onPair,
		onConnect,
		onUnpair,
		onUnpairAll,
		onForget,
	}: {
		pairedDevices: PairedDevice[];
		discoveredDevices: TrackerDevice[];
		isScanning: boolean;
		enabled: boolean;
		onToggleScan: () => void;
		onPair: (endpointId: string, name: string) => void;
		onConnect: (id: string) => void;
		onUnpair: (endpointId: string) => void;
		onUnpairAll: () => void;
		onForget: (id: string) => void;
	} = $props();

	function modelLabel(type: string) {
		const map: Record<string, string> = {
			X2: "HaritoraX 2",
			Wireless: "HaritoraX Wireless",
			Wired: "HaritoraX 1.1b/1.1/1.0",
		};
		return map[type] ?? type;
	}

	function rssiColor(rssi: number) {
		if (rssi > -50) return "text-green-400";
		if (rssi > -70) return "text-yellow-400";
		return "text-red-400";
	}
</script>

<div class="rounded-lg bg-panel p-6">
	<div class="mb-4 flex items-center gap-3">
		<Icon icon="mdi:bluetooth" width={24} class="text-secondary" />
		<h2 class="text-xl font-semibold">{$t("home.pairing.bluetooth.title")}</h2>
	</div>

	<div class="grid grid-cols-1 gap-4">
		<!-- paired devices -->
		<div class="rounded-lg bg-quaternary p-4">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="grow text-base font-medium">{$t("home.pairing.bluetooth.paired_devices")}</h3>
				{#if pairedDevices.length > 0}
					<div class="text-sm">
						<Button
							label={$t("home.pairing.bluetooth.unpair_all")}
							icon="mdi:link-off"
							background="danger"
							disabled={!enabled || !pairedDevices.some((device) => device.connectedVia === "ble")}
							onClick={onUnpairAll}
						/>
					</div>
				{/if}
			</div>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				{#if pairedDevices.length === 0}
					<div class="py-4 text-center text-sm sm:col-span-2 xl:col-span-3">
						<Icon icon="mdi:bluetooth-off" width={24} class="mx-auto mb-2 opacity-50" />
						<p>{$t("home.pairing.bluetooth.no_paired_devices")}</p>
					</div>
				{:else}
					{#each pairedDevices as device (device.id)}
						{@const connected = device.connectedVia === "ble"}
						<div class="flex flex-col gap-1.5 rounded-md bg-tertiary p-2">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-1.5">
									<Icon icon="mdi:bluetooth" width={14} class="shrink-0 text-blue-400" />
									<span class="truncate text-xs font-medium">{device.deviceName}</span>
								</div>
								<span
									class="shrink-0 rounded px-1 py-0.5 text-xs text-white {connected
										? 'bg-green-500'
										: 'bg-gray-500'}"
								>
									{connected
										? $t("home.pairing.bluetooth.connected")
										: $t("home.pairing.bluetooth.disconnected")}
								</span>
							</div>
							<div class="flex items-center justify-between">
								<div class="truncate text-xs">
									{device.bodyPart || $t("home.pairing.bluetooth.body_part_unknown")}
								</div>
								{#if device.trackerType}
									<span class="shrink-0 rounded bg-blue-500 px-1 py-0.5 text-xs text-white">
										{modelLabel(device.trackerType)}
									</span>
								{/if}
							</div>
							{#if connected && device.endpointId}
								<Button
									label={$t("home.pairing.bluetooth.disconnect")}
									icon="mdi:link-off"
									background="danger"
									disabled={!enabled}
									className="text-xs h-7 px-2"
									onClick={() => onUnpair(device.endpointId!)}
								/>
							{:else}
								<Button
									label={$t("home.pairing.bluetooth.connect")}
									icon="mdi:link-variant"
									background="primary"
									disabled={!enabled || device.connectedVia === "serial"}
									className="text-xs h-7 px-2"
									onClick={() => onConnect(device.id)}
								/>
							{/if}
							<Button
								label={$t("home.pairing.bluetooth.forget")}
								icon="mdi:delete-outline"
								background="quaternary"
								className="text-xs h-7 px-2"
								onClick={() => onForget(device.id)}
							/>
						</div>
					{/each}
				{/if}
			</div>
		</div>

		<!-- discovered devices -->
		<div class="rounded-lg bg-quaternary p-4">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="grow text-base font-medium">{$t("home.pairing.bluetooth.discovered_devices")}</h3>
				<div class="text-sm">
					<Button
						label={isScanning
							? $t("home.pairing.bluetooth.stop_scanning")
							: $t("home.pairing.bluetooth.scan_devices")}
						icon={isScanning ? "mdi:stop" : "mdi:magnify"}
						background={isScanning ? "danger" : "primary"}
						onClick={onToggleScan}
					/>
				</div>
			</div>

			<div class="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				{#if discoveredDevices.length === 0}
					<div class="col-span-1 py-4 text-center text-sm sm:col-span-4">
						{#if isScanning}
							<Icon icon="mdi:loading" width={24} class="mx-auto mb-2 animate-spin" />
							<p>{$t("home.pairing.bluetooth.searching")}</p>
						{:else}
							<Icon icon="mdi:bluetooth-off" width={24} class="mx-auto mb-2 opacity-50" />
							<p>{$t("home.pairing.bluetooth.no_devices_found")}</p>
						{/if}
					</div>
				{:else}
					{#each discoveredDevices as device (device.endpointId)}
						<div class="flex flex-col gap-1.5 rounded-md bg-tertiary p-2">
							<div class="flex items-center gap-1.5">
								<Icon icon="mdi:bluetooth" width={14} class="shrink-0 text-blue-400" />
								<span class="truncate text-xs font-medium">{device.deviceName}</span>
								{#if device.rssi}
									<div class="flex shrink-0 items-center gap-1">
										<Icon icon="mdi:wifi" width={10} class={rssiColor(device.rssi)} />
										<span class="text-xs">{device.rssi}</span>
									</div>
								{/if}
							</div>
							<div class="truncate font-mono text-xs">{device.endpointId}</div>
							<Button
								label={enabled
									? $t("home.pairing.bluetooth.connect")
									: $t("home.pairing.bluetooth.save")}
								icon="mdi:link"
								background="primary"
								className="text-xs h-7 px-2"
								onClick={() => onPair(device.endpointId, device.deviceName)}
							/>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	</div>
</div>
