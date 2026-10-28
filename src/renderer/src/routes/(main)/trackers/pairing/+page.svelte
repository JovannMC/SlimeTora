<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { invoke, listen } from "#lib/api/backend";
	import { error, info } from "#lib/log/index";
	import { t } from "#lib/lang/index";
	import { MODEL_FROM_LIBRARY } from "#lib/backend/mapping";
	import BluetoothPanel from "#lib/components/pairing/BluetoothPanel.svelte";
	import SerialPanel from "#lib/components/pairing/SerialPanel.svelte";
	import type { PairedDevice, PortSlot, TrackerDevice } from "#lib/components/pairing/types";
	import type { TrackerModel } from "#lib/types/tracker";

	// TODO: pairing serial trackers is a placeholder for the dongle slot status, it's not checked against the dongle yet

	let isScanning = $state(false);
	let discoveredDevices: TrackerDevice[] = $state([]);
	let pairedDevices: PairedDevice[] = $state([]);
	let portTrackers: Record<string, PortSlot[]> = $state({});
	let availablePorts: string[] = $state([]);

	let unlisteners: (() => void)[] = [];

	let endpointModels: Record<string, TrackerModel | undefined> = $state({});

	// every discovered serial port gets two empty slots whenever the list changes
	const emptySlots = (): PortSlot[] => [
		{ portId: "0", status: "unpaired", trackerName: "", channel: 1 },
		{ portId: "1", status: "unpaired", trackerName: "", channel: 1 },
	];

	$effect(() => {
		portTrackers = Object.fromEntries(availablePorts.map((port) => [port, emptySlots()]));
	});

	function setConnected(endpointId: string, connected: boolean) {
		pairedDevices = pairedDevices.map((d) => (d.endpointId === endpointId ? { ...d, connected } : d));
	}

	// TODO: this needs to be quicker or smth, it takes forever for the lists to update when pairing page opens
	async function syncBackend() {
		try {
			const endpoints = await invoke("discover");
			// BLE devices
			pairedDevices = endpoints
				.filter((e) => e.connection === "ble")
				.map((e) => ({
					endpointId: e.id,
					deviceName: e.displayName,
					connected: true,
					trackerType: e.model ? MODEL_FROM_LIBRARY[e.model] : undefined,
				}));
			// serial ports
			availablePorts = endpoints
				.filter((e) => e.connection === "serial")
				.map((e) => e.id)
				.sort();
		} catch (err) {
			error(["trackers", "pairing"], `Failed to sync with backend: ${err}`);
		}
	}

	onMount(() => {
		unlisteners = [
			listen("endpoint:connected", ({ endpointId, displayName }) => {
				setConnected(endpointId, true);
				if (!pairedDevices.find((d) => d.endpointId === endpointId)) {
					pairedDevices = [
						...pairedDevices,
						{
							endpointId,
							deviceName: displayName,
							connected: true,
							trackerType: endpointModels[endpointId],
						},
					];
				}
			}),
			listen("endpoint:disconnected", ({ endpointId, reason }) => {
				info(["trackers", "pairing"], `Endpoint ${endpointId} disconnected: ${reason}`);
				pairedDevices = pairedDevices.filter((d) => d.endpointId !== endpointId);
				// clean up model map when endpoint disconnects
				endpointModels = Object.fromEntries(
					Object.entries(endpointModels).filter(([eid]) => eid !== endpointId),
				);
			}),

			listen("device:connected", ({ endpointId, model }) => {
				if (model) {
					endpointModels = { ...endpointModels, [endpointId]: MODEL_FROM_LIBRARY[model] };
				}
			}),
		];
		void syncBackend();
	});

	onDestroy(() => {
		for (const unlisten of unlisteners) unlisten();
		if (isScanning) void stopScan();
	});

	async function startScan() {
		if (isScanning) return;

		isScanning = true;
		discoveredDevices = [];
		info(["trackers", "pairing"], "Started BLE scanning");

		try {
			const endpoints = await invoke("discover");
			discoveredDevices = endpoints
				.filter((endpoint) => endpoint.connection === "ble")
				.map((endpoint) => ({
					endpointId: endpoint.id,
					deviceName: endpoint.displayName,
					trackerType: endpoint.model ? MODEL_FROM_LIBRARY[endpoint.model] : undefined,
					rssi: endpoint.rssi,
				}));
			info(
				["trackers", "pairing"],
				`BLE scanning completed. Found ${discoveredDevices.length} HaritoraX devices`,
			);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to start BLE scanning: ${err}`);
		} finally {
			isScanning = false;
		}
	}

	async function stopScan() {
		if (!isScanning) return;

		try {
			await invoke("stopDiscovery");
			isScanning = false;
			info(["trackers", "pairing"], "Stopped BLE scanning");
		} catch (err) {
			error(["trackers", "pairing"], `Failed to stop BLE scanning: ${err}`);
		}
	}

	async function pair(endpointId: string, name: string) {
		try {
			await invoke("connect", endpointId);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to connect to ${name}: ${err}`);
			return;
		}

		const device = discoveredDevices.find((d) => d.endpointId === endpointId);
		pairedDevices = [
			...pairedDevices.filter((d) => d.endpointId !== endpointId),
			{ endpointId, deviceName: name, connected: true, trackerType: device?.trackerType },
		];
		discoveredDevices = discoveredDevices.filter((d) => d.endpointId !== endpointId);
		info(["trackers", "pairing"], `Connected to device: ${name}`);
	}

	async function unpair(endpointId: string) {
		pairedDevices = pairedDevices.filter((d) => d.endpointId !== endpointId);

		try {
			await invoke("disconnect", endpointId);
			info(["trackers", "pairing"], `Unpaired device: ${endpointId}`);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to unpair device: ${err}`);
		}
	}

	async function unpairAll() {
		const endpoints = pairedDevices.map((d) => d.endpointId);
		pairedDevices = [];

		for (const endpointId of endpoints) {
			try {
				await invoke("disconnect", endpointId);
			} catch (err) {
				error(["trackers", "pairing"], `Failed to unpair ${endpointId}: ${err}`);
			}
		}
		info(["trackers", "pairing"], "Unpaired all devices");
	}

	function updateSlot(port: string, portId: string, change: Partial<PortSlot>) {
		const slots = portTrackers[port];
		if (!slots) return;

		portTrackers = {
			...portTrackers,
			[port]: slots.map((slot) => (slot.portId === portId ? { ...slot, ...change } : slot)),
		};
	}

	async function togglePair(port: string, portId: string) {
		const slot = portTrackers[port]?.find((s) => s.portId === portId);
		if (!slot) return;

		if (slot.status === "unpaired") {
			updateSlot(port, portId, { status: "pairing" });
			try {
				await invoke("pair", port, portId);
				const device = (await invoke("getDevices")).find((d) => d.endpointId === port && d.slot === portId);
				updateSlot(port, portId, { status: "paired", trackerName: device?.deviceId ?? "" });
			} catch (err) {
				error(["trackers", "pairing"], `Failed to pair slot ${portId} on ${port}: ${err}`);
				updateSlot(port, portId, { status: "unpaired" });
			}
		} else {
			try {
				await invoke("unpair", port, portId);
				updateSlot(port, portId, { status: "unpaired", trackerName: "" });
			} catch (err) {
				error(["trackers", "pairing"], `Failed to unpair slot ${portId} on ${port}: ${err}`);
			}
		}
	}

	async function setChannel(port: string, portId: string, channel: number) {
		try {
			await invoke("setChannel", port, channel);
			updateSlot(port, portId, { channel });
		} catch (err) {
			error(["trackers", "pairing"], `Failed to set channel ${channel} on ${port}: ${err}`);
		}
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="text-center">
		<h1 class="mb-2 text-3xl font-bold">{$t("home.pairing.title")}</h1>
		<p>{$t("home.pairing.subtitle")}</p>
	</div>

	<BluetoothPanel
		{pairedDevices}
		{discoveredDevices}
		{isScanning}
		onToggleScan={() => (isScanning ? stopScan() : startScan())}
		onPair={pair}
		onUnpair={unpair}
		onUnpairAll={unpairAll}
	/>

	<SerialPanel ports={availablePorts} {portTrackers} onTogglePair={togglePair} onChannel={setChannel} />
</div>
