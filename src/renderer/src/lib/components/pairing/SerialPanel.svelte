<script lang="ts">
	import Icon from "@iconify/svelte";
	import { t } from "#lib/lang/index.js";
	import Button from "#lib/components/settings/Button.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import type { PortSlot, SlotStatus } from "./types.js";

	let {
		ports,
		portTrackers,
		onTogglePair,
		onChannel,
	}: {
		ports: string[];
		portTrackers: Record<string, PortSlot[]>;
		onTogglePair: (port: string, portId: string) => void;
		onChannel: (port: string, portId: string, channel: number) => void;
	} = $props();

	const CHANNELS = Array.from({ length: 10 }, (_, i) => i + 1);

	function statusLabel(status: SlotStatus) {
		if (status === "paired") return $t("trackers.pairing.paired");
		if (status === "pairing") return $t("trackers.pairing.serial.pairing");
		return $t("trackers.pairing.serial.unpaired");
	}

	function statusClass(status: SlotStatus) {
		if (status === "paired") return "bg-green-500 text-white";
		if (status === "pairing") return "bg-yellow-500 text-white";
		return "bg-gray-500 text-white";
	}
</script>

<div class="rounded-lg bg-panel p-6">
	<div class="mb-4 flex items-center gap-3">
		<Icon icon="mdi:usb-port" width={24} class="text-secondary" />
		<h2 class="text-xl font-semibold">{$t("trackers.pairing.serial.title")}</h2>
	</div>

	<div class="space-y-6">
		{#if ports.length === 0}
			<div class="py-8 text-center text-secondary">
				<Icon icon="mdi:usb-off" width={32} class="mx-auto mb-2 opacity-50" />
				<p>{$t("trackers.pairing.serial.no_ports")}</p>
			</div>
		{:else}
			{#each ports as port (port)}
				<div class="rounded-lg bg-quaternary p-4">
					<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<Icon icon="mdi:usb-port" width={20} class="text-secondary" />
						{$t("trackers.pairing.serial.serial_port", { port })}
					</h3>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						{#each portTrackers[port] ?? [] as slot (slot.portId)}
							<div class="flex h-full flex-col justify-between rounded-md bg-panel p-4">
								<div class="mb-3 flex items-center justify-between">
									<h4 class="font-medium">
										{$t("trackers.pairing.serial.port_id", { id: slot.portId })}
									</h4>
									<span class="rounded px-2 py-1 text-sm {statusClass(slot.status)}">
										{statusLabel(slot.status)}
									</span>
								</div>

								<div class="mb-4">
									<span class="block text-base font-semibold"
										>{$t("trackers.pairing.serial.tracker")}</span
									>
									<span class="text-base font-normal">
										{slot.status === "paired"
											? slot.trackerName
											: $t("trackers.pairing.serial.none")}
									</span>
								</div>
								<div class="flex flex-row items-center justify-center gap-2">
									<Select
										options={CHANNELS.map((num) => ({
											value: String(num),
											label: $t("trackers.pairing.serial.channel_num", { num }),
										}))}
										selected={String(slot.channel)}
										onChange={(value) => onChannel(port, slot.portId, Number(value))}
										className="w-full"
									/>
									<Button
										label={slot.status === "paired"
											? $t("trackers.pairing.serial.unpair")
											: $t("trackers.pairing.serial.pair")}
										icon={slot.status === "paired" ? "mdi:link-off" : "mdi:link"}
										background={slot.status === "paired" ? "danger" : "button"}
										className="w-full text-xs h-8"
										onClick={() => onTogglePair(port, slot.portId)}
									/>
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
