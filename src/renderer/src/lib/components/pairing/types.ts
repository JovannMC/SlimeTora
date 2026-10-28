import type { TrackerModel } from "#lib/types/tracker";

// a BLE endpoint the library found, its id is the BLE local name
export interface TrackerDevice {
	endpointId: string;
	deviceName: string;
	trackerType?: TrackerModel;
	rssi?: number;
}

export interface PairedDevice {
	endpointId: string;
	deviceName: string;
	connected: boolean;
	trackerType?: TrackerModel;
}

export type SlotStatus = "paired" | "unpaired" | "pairing";

// one of the two tracker slots on a GX dongle port
export interface PortSlot {
	portId: string;
	status: SlotStatus;
	trackerName: string;
	channel: number;
}
