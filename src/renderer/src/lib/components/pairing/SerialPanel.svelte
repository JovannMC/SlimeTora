<script lang="ts">
	import Icon from "@iconify/svelte";
	import { t } from "#lib/lang/index";
	import Button from "#lib/components/settings/Button.svelte";
	import Select from "#lib/components/settings/Select.svelte";
	import type { PortSlot, SlotStatus } from "./types";

	let {
		ports,
		portTrackers,
		channels,
		connectedEndpoints,
		enabled,
		onManageSlot,
		onChannel,
	}: {
		ports: string[];
		portTrackers: Record<string, PortSlot[]>;
		channels: Record<string, number>;
		connectedEndpoints: string[];
		enabled: boolean;
		onManageSlot: (port: string, portId: string, action: "pair" | "unpair") => void;
		onChannel: (port: string, channel: number) => void;
	} = $props();

	const CHANNELS = Array.from({ length: 10 }, (_, i) => i + 1);

	function statusLabel(status: SlotStatus) {
		if (status === "paired") return $t("home.pairing.serial.paired");
		if (status === "pairing") return $t("home.pairing.serial.pairing");
		return $t(`home.pairing.serial.${status}`);
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
		<h2 class="text-xl font-semibold">{$t("home.pairing.serial.title")}</h2>
	</div>

	<div class="space-y-6">
		{#if ports.length === 0}
			<div class="py-8 text-center text-secondary">
				<Icon icon="mdi:usb-off" width={32} class="mx-auto mb-2 opacity-50" />
				<p>{$t("home.pairing.serial.no_ports")}</p>
			</div>
		{:else}
			{#each ports as port (port)}
				<div class="rounded-lg bg-quaternary p-4">
					<h3 class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<Icon icon="mdi:usb-port" width={20} class="text-secondary" />
						{$t("home.pairing.serial.serial_port", { port })}
					</h3>
					<fieldset
						disabled={!enabled || !connectedEndpoints.includes(port) || channels[port] === undefined}
						class="mb-4 disabled:opacity-50"
					>
						<Select
							options={channels[port] === undefined
								? [{ value: "", label: $t("home.pairing.serial.channel_unknown") }]
								: CHANNELS.map((num) => ({
										value: String(num),
										label: $t("home.pairing.serial.channel_num", { num }),
									}))}
							selected={channels[port] === undefined ? "" : String(channels[port])}
							selectClassName="!bg-tertiary"
							onChange={(value) => onChannel(port, Number(value))}
						/>
					</fieldset>

					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						{#each portTrackers[port] ?? [] as slot (slot.portId)}
							<div class="flex h-full flex-col justify-between rounded-md bg-panel p-4">
								<div class="mb-3 flex items-center justify-between">
									<h4 class="font-medium">
										{$t("home.pairing.serial.port_id", { id: slot.portId })}
									</h4>
									<span class="rounded px-2 py-1 text-sm {statusClass(slot.status)}">
										{statusLabel(slot.status)}
									</span>
								</div>

								<div class="mb-4">
									<span class="block text-base font-bold">
										{slot.trackerName || $t("home.pairing.serial.none")}
									</span>
									<span class="text-base font-normal">
										{slot.bodyPart || $t("home.pairing.serial.none")}
									</span>
								</div>

								<fieldset
									disabled={!enabled ||
										!connectedEndpoints.includes(port) ||
										channels[port] === undefined ||
										slot.status === "pairing"}
									class="flex flex-row items-center justify-center gap-2 disabled:opacity-50"
								>
									<Button
										label={$t("home.pairing.serial.pair")}
										icon="mdi:link"
										background="button"
										disabled={slot.status === "paired" || slot.status === "detected"}
										className="w-full text-xs h-8"
										onClick={() => onManageSlot(port, slot.portId, "pair")}
									/>
									<Button
										label={$t("home.pairing.serial.unpair")}
										icon="mdi:link-off"
										background="danger"
										disabled={slot.status === "unpaired"}
										className="w-full text-xs h-8"
										onClick={() => onManageSlot(port, slot.portId, "unpair")}
									/>
								</fieldset>
							</div>
						{/each}
					</div>
				</div>
			{/each}
		{/if}
	</div>
</div>
