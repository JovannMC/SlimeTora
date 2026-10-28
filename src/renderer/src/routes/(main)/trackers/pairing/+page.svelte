<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { invoke, listen } from "#lib/api/backend";
	import { error, info } from "#lib/log/index";
	import { t } from "#lib/lang/index";
	import { connection } from "#lib/store/settings";
	import { saveTrackerConfig } from "#lib/store/index";
	import { ConnectionMode } from "#lib/types/connection";
	import { TrackerModel } from "#lib/types/tracker";
	import BluetoothPanel from "#lib/components/pairing/BluetoothPanel.svelte";
	import SerialPanel from "#lib/components/pairing/SerialPanel.svelte";
	import type { PairedDevice, PortSlot, TrackerDevice } from "#lib/components/pairing/types";

	// TODO: unify bluetooth and serial devices into one list (they are handled differently right now)
	// TODO: load paired bluetooth devices from config

	let isScanning = $state(false);
	let discoveredDevices: TrackerDevice[] = $state([]);
	let pairedDevices: PairedDevice[] = $state([]);
	let portTrackers: Record<string, PortSlot[]> = $state({});

	let unlistenConnect: (() => void) | undefined;
	let unlistenDisconnect: (() => void) | undefined;

	const ports = $derived($connection.ports);

	// every port gets two empty slots whenever the list of ports changes
	const emptySlots = (): PortSlot[] => [
		{ portId: "0", status: "unpaired", trackerName: "", channel: 1 },
		{ portId: "1", status: "unpaired", trackerName: "", channel: 1 },
	];

	$effect(() => {
		portTrackers = Object.fromEntries(ports.map((port) => [port, emptySlots()]));
	});

	onMount(async () => {
		try {
			unlistenConnect = await listen("connect", (event) => {
				// the "connect" event is also handled in notifications.ts for the trackers store
				const payload = event.payload as { tracker: string; tracker_type: TrackerModel };
				pairedDevices = pairedDevices.map((d) =>
					d.macAddress === payload.tracker ? { ...d, connected: true, trackerType: payload.tracker_type } : d,
				);
			});

			unlistenDisconnect = await listen("disconnect", (event) => {
				const payload = event.payload as { tracker: string };
				info(["trackers", "pairing"], `Device disconnected: ${payload.tracker}`);
				pairedDevices = pairedDevices.map((d) =>
					d.macAddress === payload.tracker ? { ...d, connected: false } : d,
				);
			});
		} catch (err) {
			error(["trackers", "pairing"], `Failed to initialize pairing page: ${err}`);
		}
	});

	onDestroy(() => {
		unlistenConnect?.();
		unlistenDisconnect?.();
		if (isScanning) stopScan();
	});

	// keeps the connection store's MAC list in step with the paired devices
	function syncMacAddresses() {
		connection.update((s) => ({ ...s, macAddresses: pairedDevices.map((d) => d.macAddress) }));
	}

	async function startScan() {
		if (isScanning) return;

		isScanning = true;
		discoveredDevices = [];
		info(["trackers", "pairing"], "Started BLE scanning");

		try {
			const devices = await invoke<TrackerDevice[]>("start_ble_scanning", { timeout: 5000 });
			discoveredDevices = devices.map(({ deviceName, macAddress, trackerType, rssi }) => ({
				deviceName,
				macAddress,
				trackerType,
				rssi,
			}));
			info(["trackers", "pairing"], `BLE scanning completed. Found ${devices.length} HaritoraX devices`);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to start BLE scanning: ${err}`);
		} finally {
			isScanning = false;
		}
	}

	async function stopScan() {
		if (!isScanning) return;

		try {
			await invoke("stop_ble_scanning");
			isScanning = false;
			info(["trackers", "pairing"], "Stopped BLE scanning");
		} catch (err) {
			error(["trackers", "pairing"], `Failed to stop BLE scanning: ${err}`);
		}
	}

	function pair(address: string, name: string) {
		if (!pairedDevices.some((d) => d.macAddress === address)) {
			const trackerType = name.startsWith("HaritoraX2-")
				? TrackerModel.X2
				: name.startsWith("HaritoraXW-")
					? TrackerModel.Wireless
					: TrackerModel.Wired;
			const id = name.includes("-") ? name.substring(name.indexOf("-") + 1) : name;

			pairedDevices = [
				...pairedDevices,
				{ macAddress: address, deviceName: name, connected: false, trackerType },
			];
			saveTrackerConfig({
				id,
				name,
				connection_mode: ConnectionMode.BLE,
				tracker_type: trackerType,
				mac: address,
			});
			syncMacAddresses();
		}

		discoveredDevices = discoveredDevices.filter((d) => d.macAddress !== address);
		info(["trackers", "pairing"], `Paired device: ${name}`);
	}

	async function unpair(address: string) {
		pairedDevices = pairedDevices.filter((d) => d.macAddress !== address);
		syncMacAddresses();

		try {
			await invoke("disconnect_device", { macAddress: address });
			info(["trackers", "pairing"], `Unpaired device: ${address}`);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to unpair device: ${err}`);
		}
	}

	async function unpairAll() {
		try {
			await invoke("stop_ble_connections");
			pairedDevices = [];
			syncMacAddresses();
			info(["trackers", "pairing"], "Unpaired all devices");
		} catch (err) {
			error(["trackers", "pairing"], `Failed to unpair all devices: ${err}`);
		}
	}

	function updateSlot(port: string, portId: string, change: Partial<PortSlot>) {
		const slots = portTrackers[port];
		if (!slots) return;

		portTrackers = {
			...portTrackers,
			[port]: slots.map((slot) => (slot.portId === portId ? { ...slot, ...change } : slot)),
		};
	}

	// TODO: pairing serial trackers is a placeholder, it doesn't talk to the dongle yet
	function togglePair(port: string, portId: string) {
		const slot = portTrackers[port]?.find((s) => s.portId === portId);
		if (!slot) return;

		if (slot.status === "unpaired") {
			updateSlot(port, portId, { status: "paired", trackerName: "meow" });
		} else {
			updateSlot(port, portId, { status: "unpaired", trackerName: "" });
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

	<SerialPanel
		{ports}
		{portTrackers}
		onTogglePair={togglePair}
		onChannel={(port, portId, channel) => updateSlot(port, portId, { channel })}
	/>
</div>
