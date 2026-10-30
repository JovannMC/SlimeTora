<script lang="ts">
	import { onDestroy } from "svelte";
	import { invoke } from "#lib/api/backend";
	import { error, info } from "#lib/log/index";
	import { t } from "#lib/lang/index";
	import { getBlePairingDevices } from "#lib/backend/ble-pairing";
	import BluetoothPanel from "#lib/components/pairing/BluetoothPanel.svelte";
	import SerialPanel from "#lib/components/pairing/SerialPanel.svelte";
	import type { PortSlot } from "#lib/components/pairing/types";
	import { isOn, knownTrackers } from "#lib/store/index";
	import { forgetBleDevice, saveBleDevice, savedBleDevices } from "#lib/store/ble-devices";
	import { backendSnapshot } from "#lib/backend/state";
	import { serialFromBleName } from "#lib/util/index.ts";

	let isScanning = $state(false);
	let pairingError = $state("");
	const availablePorts = $derived(
		$backendSnapshot.endpoints
			.filter((e) => e.connection === "serial" && e.dongle)
			.map((e) => e.id)
			.sort(),
	);
	let busySlots: Record<string, boolean> = $state({});

	const savedBle = $derived(new Map($savedBleDevices.map((device) => [device.serial, device])));
	const bleDevices = $derived(getBlePairingDevices($backendSnapshot, $savedBleDevices, $knownTrackers));
	const pairedDevices = $derived(bleDevices.pairedDevices);
	const discoveredDevices = $derived(bleDevices.discoveredDevices);

	const portTrackers = $derived.by(() =>
		Object.fromEntries(
			availablePorts.map((port) => [
				port,
				["0", "1"].map((portId): PortSlot => {
					const device = $backendSnapshot.devices.find(
						(item) => item.endpointId === port && item.slot === portId,
					);
					const reported = $backendSnapshot.dongleSlots[port]?.[portId];
					const status = busySlots[`${port}:${portId}`]
						? "pairing"
						: (reported ?? (device ? "detected" : "unknown"));
					return {
						portId,
						status,
						trackerName: status === "unpaired" ? "" : (device?.deviceId ?? ""),
						bodyPart:
							status === "unpaired"
								? ""
								: (device?.trackers.map((tracker) => tracker.bodyPart).join(", ") ?? ""),
					};
				}),
			]),
		),
	);

	let refreshRequest = 0;
	let destroyed = false;
	let previewScanning = false;

	async function refresh(preview = false) {
		const request = ++refreshRequest;
		const scanning = isScanning;
		try {
			const endpoints = await invoke(preview ? "scanBlePreview" : "discover");

			if (destroyed || request !== refreshRequest) return;

			if (scanning) {
				info(
					["trackers", "pairing"],
					`BLE scanning completed. Found ${endpoints.filter((endpoint) => endpoint.connection === "ble").length} HaritoraX devices`,
				);
			}
		} catch (err) {
			error(["trackers", "pairing"], `Failed to refresh endpoints: ${err}`);
		} finally {
			if (scanning && request === refreshRequest) isScanning = false;
		}
	}

	onDestroy(() => {
		destroyed = true;
		refreshRequest++;
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
		pairingError = "";

		try {
			const existing = pairedDevices.find((device) => device.id === serial);
			if (existing?.connectedVia) return;
			if (
				existing?.endpointId &&
				$backendSnapshot.endpoints.some((endpoint) => endpoint.id === existing.endpointId)
			) {
				await invoke("connect", existing.endpointId);
				return;
			}
			const endpoints = await invoke("discover");
			if (!$isOn || destroyed) return;
			const device = getBlePairingDevices(
				{ ...$backendSnapshot, endpoints },
				$savedBleDevices,
				$knownTrackers,
			).pairedDevices.find((item) => item.id === serial);
			if (device?.connectedVia) return;
			if (!device?.endpointId) {
				pairingError = `Could not find ${name} (${serial}). Is it powered on and nearby?`;
				error(["trackers", "pairing"], `Could not find ${name} (${serial}) — is it powered on and nearby?`);
				return;
			}
			await invoke("connect", device.endpointId);
			info(["trackers", "pairing"], `Connected to device: ${name}`);
		} catch (err) {
			if (!destroyed) pairingError = `Failed to connect to ${name}: ${err}`;
			error(["trackers", "pairing"], `Failed to connect to ${name}: ${err}`);
		}
	}

	async function pair(endpointId: string, name: string) {
		pairingError = "";
		try {
			const serial = serialFromBleName(name).trim();
			if (!name.includes("-") || !serial) throw new Error("The advertisement does not contain a tracker serial");
			await saveBleDevice({
				serial,
				name,
				model: discoveredDevices.find((device) => device.endpointId === endpointId)?.trackerType,
				confirmed: false,
			});
			if (!$isOn || destroyed) return;
			await invoke("connect", endpointId);
			info(["trackers", "pairing"], `Connected to device: ${name}`);
		} catch (err) {
			if (!destroyed) pairingError = `Failed to ${$isOn ? "connect" : "save"} ${name}: ${err}`;
			error(["trackers", "pairing"], `Failed to connect to ${name}: ${err}`);
		}
	}

	async function unpair(endpointId: string) {
		try {
			await invoke("disconnect", endpointId);
			info(["trackers", "pairing"], `Disconnected device: ${endpointId}`);
		} catch (err) {
			if (!destroyed) pairingError = `Failed to disconnect ${endpointId}: ${err}`;
			error(["trackers", "pairing"], pairingError);
		}
	}

	async function forget(id: string) {
		const device = pairedDevices.find((item) => item.id === id);
		if (!device) return;
		try {
			if ($isOn) await invoke("forgetBleTarget", id);
			await forgetBleDevice(id);
		} catch (err) {
			if (!destroyed) pairingError = `Failed to forget ${device.deviceName}: ${err}`;
			error(["trackers", "pairing"], pairingError);
		}
	}

	async function unpairAll() {
		for (const device of pairedDevices) {
			if (device.connectedVia !== "ble" || !device.endpointId) continue;

			try {
				await invoke("disconnect", device.endpointId);
			} catch (err) {
				error(["trackers", "pairing"], `Failed to disconnect ${device.endpointId}: ${err}`);
			}
		}
		info(["trackers", "pairing"], "Disconnected all devices");
	}

	async function manageSlot(port: string, portId: string, action: "pair" | "unpair") {
		if (!$isOn) return;
		const key = `${port}:${portId}`;
		if (busySlots[key]) return;
		busySlots = { ...busySlots, [key]: true };
		pairingError = "";
		try {
			await invoke(action, port, portId);
		} catch (err) {
			if (!destroyed) pairingError = `Failed to ${action} slot ${portId} on ${port}: ${err}`;
			error(["trackers", "pairing"], pairingError);
		} finally {
			if (!destroyed) busySlots = { ...busySlots, [key]: false };
		}
	}

	async function setChannel(port: string, channel: number) {
		if (!$isOn) return;
		try {
			await invoke("setChannel", port, channel);
		} catch (err) {
			if (!destroyed) pairingError = `Failed to set channel: ${err}`;
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
	{#if pairingError}
		<p class="rounded-lg bg-panel p-4 text-sm text-red-300" role="alert">{pairingError}</p>
	{/if}

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
		onForget={forget}
	/>

	<SerialPanel
		ports={availablePorts}
		{portTrackers}
		channels={$backendSnapshot.dongleChannels}
		connectedEndpoints={$backendSnapshot.connectedEndpointIds}
		enabled={$isOn === true}
		onManageSlot={manageSlot}
		onChannel={setChannel}
	/>
</div>
