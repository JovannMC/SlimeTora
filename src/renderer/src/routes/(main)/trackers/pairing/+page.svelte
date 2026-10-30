<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import { SvelteMap, SvelteSet } from "svelte/reactivity";
	import { invoke, listen } from "#lib/api/backend";
	import { error, info } from "#lib/log/index";
	import { t } from "#lib/lang/index";
	import { MODEL_FROM_LIBRARY } from "#lib/backend/mapping";
	import BluetoothPanel from "#lib/components/pairing/BluetoothPanel.svelte";
	import SerialPanel from "#lib/components/pairing/SerialPanel.svelte";
	import type { PortSlot } from "#lib/components/pairing/types";
	import { ConnectionMode } from "#lib/types/connection";
	import type { TrackerModel } from "#lib/types/tracker";
	import { isOn, knownTrackers } from "#lib/store/index";
	import type { EndpointDescriptor } from "haritorax-interpreter";
	import { serialFromBleName } from "#lib/util/index.ts";

	// TODO: pairing serial trackers is a placeholder for the dongle slot status, it's not checked against the dongle yet

	let isScanning = $state(false);
	let availablePorts: string[] = $state([]);
	let portTrackers: Record<string, PortSlot[]> = $state({});

	const knownBle = new SvelteMap<string, { name: string; model?: TrackerModel; rssi?: number }>();
	const connectedBle = new SvelteSet<string>();
	const endpointModels: Record<string, TrackerModel | undefined> = $state({});
	const savedBle = $derived(
		new Map(
			$knownTrackers
				.filter((tracker) => tracker.connection_mode === ConnectionMode.BLE)
				.map((tracker) => {
					const serial = tracker.id.split(":")[0]!;
					return [serial, { id: tracker.id, name: tracker.name, trackerType: tracker.tracker_type }];
				}),
		),
	);

	const pairedDevices = $derived(
		[...savedBle].map(([serial, saved]) => {
			const endpointId = [...knownBle.entries()].find(
				([id, device]) => serialFromBleName(device.name) === serial || id === serial,
			)?.[0];
			const device = endpointId ? knownBle.get(endpointId) : undefined;
			return {
				id: saved.id,
				endpointId,
				deviceName: saved.name,
				connected: Boolean(endpointId && connectedBle.has(endpointId)),
				trackerType: device?.model ?? saved.trackerType,
			};
		}),
	);

	const discoveredDevices = $derived(
		[...knownBle]
			.filter(([id, device]) => !connectedBle.has(id) && !savedBle.has(serialFromBleName(device.name)))
			.map(([endpointId, device]) => ({
				endpointId,
				deviceName: device.name,
				trackerType: device.model,
				rssi: device.rssi,
			})),
	);

	// every discovered serial port gets two empty slots whenever the list changes
	const emptySlots = (): PortSlot[] => [
		{ portId: "0", status: "unpaired", trackerName: "", channel: 1 },
		{ portId: "1", status: "unpaired", trackerName: "", channel: 1 },
	];

	$effect(() => {
		portTrackers = Object.fromEntries(availablePorts.map((port) => [port, emptySlots()]));
	});

	let unlisteners: (() => void)[] = [];
	let refreshRequest = 0;
	let destroyed = false;
	let previewScanning = false;

	function upsertBle(endpoint: EndpointDescriptor) {
		knownBle.set(endpoint.id, {
			name: endpoint.displayName,
			model: endpoint.model ? MODEL_FROM_LIBRARY[endpoint.model] : undefined,
			rssi: endpoint.rssi,
		});
	}

	function upsertPorts(endpoints: EndpointDescriptor[]) {
		availablePorts = endpoints
			.filter((e) => e.connection === "serial")
			.map((e) => e.id)
			.sort();
	}

	async function refresh(preview = false) {
		const request = ++refreshRequest;
		const scanning = isScanning;
		try {
			const endpoints = await invoke(preview ? "scanBlePreview" : "discover");

			if (destroyed || request !== refreshRequest) return;

			const foundBle = new Set(endpoints.filter((e) => e.connection === "ble").map((e) => e.id));
			// keep connected trackers (they don't advertise), drop stale unconnected ones
			for (const id of [...knownBle.keys()]) {
				if (!connectedBle.has(id) && !foundBle.has(id)) knownBle.delete(id);
			}
			for (const endpoint of endpoints) {
				if (endpoint.connection === "ble") upsertBle(endpoint);
			}
			if (!preview) upsertPorts(endpoints);

			if (scanning) {
				info(
					["trackers", "pairing"],
					`BLE scanning completed. Found ${discoveredDevices.length} HaritoraX devices`,
				);
			}
		} catch (err) {
			error(["trackers", "pairing"], `Failed to refresh endpoints: ${err}`);
		} finally {
			if (scanning && request === refreshRequest) isScanning = false;
		}
	}

	async function syncState() {
		try {
			const [endpoints, devices] = await Promise.all([invoke("getEndpoints"), invoke("getDevices")]);
			if (destroyed) return;
			for (const endpoint of endpoints) {
				if (endpoint.connection === "ble") upsertBle(endpoint);
			}
			for (const device of devices) {
				if (device.connection !== "ble") continue;
				connectedBle.add(device.endpointId);
				const known = knownBle.get(device.endpointId);
				knownBle.set(device.endpointId, {
					name: known?.name ?? device.deviceId,
					model: known?.model ?? MODEL_FROM_LIBRARY[device.model],
					rssi: known?.rssi,
				});
			}
			upsertPorts(endpoints);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to sync with backend: ${err}`);
		}

		if (!destroyed && $isOn) void refresh();
	}

	onMount(() => {
		unlisteners = [
			listen("endpoint:connected", ({ endpointId, connection, displayName }) => {
				if (connection !== "ble") return;
				connectedBle.add(endpointId);
				if (!knownBle.has(endpointId)) {
					knownBle.set(endpointId, { name: displayName, model: endpointModels[endpointId] });
				}
			}),
			listen("endpoint:disconnected", ({ endpointId, reason }) => {
				info(["trackers", "pairing"], `Endpoint ${endpointId} disconnected: ${reason}`);
				connectedBle.delete(endpointId);
			}),
			listen("device:connected", ({ endpointId, connection, model }) => {
				if (connection !== "ble" || !model) return;
				const tracked = MODEL_FROM_LIBRARY[model];
				endpointModels[endpointId] = tracked;
				const known = knownBle.get(endpointId);
				knownBle.set(endpointId, { name: known?.name ?? endpointId, model: tracked, rssi: known?.rssi });
			}),
		];
		void syncState();
	});

	onDestroy(() => {
		destroyed = true;
		refreshRequest++;
		for (const unlisten of unlisteners) unlisten();
		if (isScanning) void stopScan();
	});

	async function startScan() {
		if (isScanning) return;

		isScanning = true;
		previewScanning = !$isOn;
		info(["trackers", "pairing"], "Started BLE scanning");
		await refresh(previewScanning);
	}

	async function stopScan() {
		if (!isScanning) return;

		try {
			refreshRequest++;
			await invoke(previewScanning ? "stopBlePreview" : "stopDiscovery");
		} catch (err) {
			error(["trackers", "pairing"], `Failed to stop BLE scanning: ${err}`);
		} finally {
			isScanning = false;
			info(["trackers", "pairing"], "Stopped BLE scanning");
		}
	}

	async function connectSaved(id: string) {
		if (!$isOn) return;
		const serial = id.split(":")[0]!;
		const saved = savedBle.get(serial);
		const name = saved?.name ?? id;

		// the tracker must be discoverable before we can connect, scan for it first
		try {
			const endpoints = await invoke("discover");
			if (!$isOn || destroyed) return;
			const endpoint = endpoints.find(
				(e) => e.connection === "ble" && serialFromBleName(e.displayName) === serial,
			);
			if (!endpoint) {
				error(["trackers", "pairing"], `Could not find ${name} (${serial}) — is it powered on and nearby?`);
				return;
			}
			upsertBle(endpoint);
			await invoke("connect", endpoint.id);
			info(["trackers", "pairing"], `Connected to device: ${name}`);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to connect to ${name}: ${err}`);
		}
	}

	async function pair(endpointId: string, name: string) {
		if (!$isOn) return;
		knownBle.set(endpointId, { name, model: endpointModels[endpointId] });

		try {
			await invoke("connect", endpointId);
			info(["trackers", "pairing"], `Connected to device: ${name}`);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to connect to ${name}: ${err}`);
		}
	}

	async function unpair(endpointId: string) {
		try {
			await invoke("disconnect", endpointId);
			info(["trackers", "pairing"], `Unpaired device: ${endpointId}`);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to unpair device: ${endpointId}: ${err}`);
		}
	}

	async function unpairAll() {
		for (const device of pairedDevices) {
			if (!device.connected || !device.endpointId) continue;

			try {
				await invoke("disconnect", device.endpointId);
			} catch (err) {
				error(["trackers", "pairing"], `Failed to disconnect ${device.endpointId}: ${err}`);
			}
		}
		info(["trackers", "pairing"], "Disconnected all devices");
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
		if (!$isOn) return;
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

	async function setChannel(port: string, _portId: string, channel: number) {
		if (!$isOn) return;
		try {
			await invoke("setChannel", port, channel);
		} catch (err) {
			error(["trackers", "pairing"], `Failed to set channel: ${err}`);
		}
	}
</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-6">
	<div class="text-center">
		<h1 class="mb-2 text-3xl font-bold">{$t("home.pairing.title")}</h1>
		<p>{$t("home.pairing.subtitle")}</p>
		{#if !$isOn}
			<p class="mt-2 text-sm">{$t("home.pairing.enable_connect")}</p>
		{/if}
	</div>

	<BluetoothPanel
		{pairedDevices}
		{discoveredDevices}
		{isScanning}
		enabled={$isOn === true}
		onToggleScan={() => (isScanning ? stopScan() : startScan())}
		onPair={pair}
		onConnect={connectSaved}
		onUnpair={unpair}
		onUnpairAll={unpairAll}
	/>

	<SerialPanel
		ports={availablePorts}
		{portTrackers}
		enabled={$isOn === true}
		onTogglePair={togglePair}
		onChannel={setChannel}
	/>
</div>
