import type { PairedDevice, TrackerDevice } from "#lib/components/pairing/types";
import type { SavedBleDevice } from "#lib/store/ble-devices";
import type { TrackerSave } from "#lib/store/index";
import { serialFromBleName } from "#lib/util/index";
import type { BackendSnapshot } from "$shared/backend/contract";
import { MODEL_FROM_LIBRARY } from "./mapping";

export function getBlePairingDevices(
	snapshot: BackendSnapshot,
	savedDevices: SavedBleDevice[],
	knownTrackers: TrackerSave[],
): { pairedDevices: PairedDevice[]; discoveredDevices: TrackerDevice[] } {
	const endpoints = [
		...new Map(
			[...snapshot.previewEndpoints, ...snapshot.endpoints]
				.filter((endpoint) => endpoint.connection === "ble")
				.map((endpoint) => [endpoint.id, endpoint]),
		).values(),
	];

	const open = new Set(snapshot.connectedEndpointIds);

	const pairedDevices = savedDevices.map((saved): PairedDevice => {
		const device = snapshot.devices.find((item) => item.deviceId === saved.serial);
		const endpoint =
			endpoints.find((item) => device?.connection === "ble" && item.id === device.endpointId) ??
			endpoints.find(
				(item) => serialFromBleName(item.displayName) === saved.serial || item.displayName === saved.name,
			);
		const endpointId = device?.connection === "ble" ? device.endpointId : endpoint?.id;
		const model = device?.model ?? endpoint?.model;

		return {
			id: saved.serial,
			endpointId,
			deviceName: saved.name,
			connectedVia:
				endpointId && open.has(endpointId)
					? "ble"
					: device?.trackers.some((tracker) => tracker.connected)
						? device.connection
						: undefined,
			trackerType: model ? MODEL_FROM_LIBRARY[model] : saved.model,
			bodyPart:
				device?.trackers.map((tracker) => tracker.bodyPart).join(", ") ||
				knownTrackers
					.filter((tracker) => tracker.id.startsWith(`${saved.serial}:`))
					.map((tracker) => tracker.bodyPart)
					.filter(Boolean)
					.join(", ") ||
				undefined,
			confirmed: saved.confirmed,
		};
	});

	const savedEndpoints = new Set(pairedDevices.map((device) => device.endpointId));
	const streamingSerials = new Set(
		snapshot.devices
			.filter((device) => device.trackers.some((tracker) => tracker.connected))
			.map((device) => device.deviceId),
	);
	const discoveredDevices = endpoints
		.filter(
			(endpoint) =>
				!open.has(endpoint.id) &&
				!savedEndpoints.has(endpoint.id) &&
				!streamingSerials.has(serialFromBleName(endpoint.displayName)),
		)
		.map((endpoint) => ({
			endpointId: endpoint.id,
			deviceName: endpoint.displayName,
			trackerType: endpoint.model ? MODEL_FROM_LIBRARY[endpoint.model] : undefined,
			rssi: endpoint.rssi,
		}));

	return { pairedDevices, discoveredDevices };
}
