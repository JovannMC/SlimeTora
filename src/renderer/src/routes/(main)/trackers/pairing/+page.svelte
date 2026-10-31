<script lang="ts">
	import { onDestroy } from "svelte";
	import { invoke } from "#lib/api/backend";
	import { error, info } from "#lib/log/index";
	import { ToastManager } from "#lib/util/toast.svelte";
	import { t } from "#lib/lang/index";
	import { getBlePairingDevices } from "#lib/backend/ble-pairing";
	import BluetoothPanel from "#lib/components/pairing/BluetoothPanel.svelte";
	import SerialPanel from "#lib/components/pairing/SerialPanel.svelte";
	import type { PortSlot } from "#lib/components/pairing/types";
	import { isOn, knownTrackers } from "#lib/store/index";
	import { connection } from "#lib/store/settings";
	import { forgetBleDevice, saveBleDevice, savedBleDevices } from "#lib/store/ble-devices";
	import { backendSnapshot } from "#lib/backend/state";
	import { serialFromBleName } from "#lib/util/index.ts";

	let isScanning = $state(false);
	const availablePorts = $derived([...$connection.ports].sort());
	let busySlots: Record<string, boolean> = $state({});

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

	function reportError(message: string) {
		error(["trackers", "pairing"], message);
		ToastManager.add({ type: "error", message });
	}

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
		const name = pairedDevices.find((device) => device.id === serial)?.deviceName ?? id;

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
				reportError($t("home.pairing.error.device_not_found", { name, serial }));
				return;
			}

			await invoke("connect", device.endpointId);
			info(["trackers", "pairing"], `Connected to device: ${name}`);
		} catch (err) {
			const message = $t("home.pairing.error.failed_connect", { name, error: String(err) });
			if (!destroyed) reportError(message);
		}
	}

	async function pair(endpointId: string, name: string) {
		try {
			const serial = serialFromBleName(name).trim();
			if (!name.includes("-") || !serial) throw new Error($t("home.pairing.error.invalid_advertisement"));
			await saveBleDevice({
				serial,
				advertisedName: name,
				confirmed: false,
			});
			if (!$isOn || destroyed) return;
			await invoke("connect", endpointId);
			info(["trackers", "pairing"], `Connected to device: ${name}`);
		} catch (err) {
			const message = $t("home.pairing.error.failed_save", { name, error: String(err) });
			if (!destroyed) reportError(message);
		}
	}

	async function unpair(endpointId: string) {
		try {
			await invoke("disconnect", endpointId);
			info(["trackers", "pairing"], `Disconnected device: ${endpointId}`);
		} catch (err) {
			if (!destroyed)
				reportError($t("home.pairing.error.failed_disconnect", { device: endpointId, error: String(err) }));
		}
	}

	async function forget(id: string) {
		const device = pairedDevices.find((item) => item.id === id);
		if (!device) return;
		try {
			if ($isOn) await invoke("forgetBleTarget", id);
			await forgetBleDevice(id);
		} catch (err) {
			if (!destroyed)
				reportError($t("home.pairing.error.failed_forget", { name: device.deviceName, error: String(err) }));
		}
	}

	async function unpairAll() {
		for (const device of pairedDevices) {
			if (device.connectedVia !== "ble" || !device.endpointId) continue;

			try {
				await invoke("disconnect", device.endpointId);
			} catch (err) {
				const message = $t("home.pairing.error.failed_disconnect", {
					device: device.endpointId,
					error: String(err),
				});
				if (!destroyed) reportError(message);
			}
		}
		info(["trackers", "pairing"], "Disconnected all devices");
	}

	async function manageSlot(port: string, portId: string, action: "pair" | "unpair") {
		if (!$isOn) return;
		const key = `${port}:${portId}`;

		if (busySlots[key]) return;

		busySlots = { ...busySlots, [key]: true };

		try {
			await invoke(action, port, portId);
		} catch (err) {
			if (!destroyed)
				reportError($t("home.pairing.error.failed_slot", {
					action: $t(`home.pairing.serial.${action}`),
					slot: portId,
					port,
					error: String(err),
				}));
		} finally {
			if (!destroyed) busySlots = { ...busySlots, [key]: false };
		}
	}

	async function setChannel(port: string, channel: number) {
		if (!$isOn) return;
		try {
			await invoke("setChannel", port, channel);
		} catch (err) {
			const message = $t("home.pairing.error.failed_channel", { error: String(err) });
			if (!destroyed) reportError(message);
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
