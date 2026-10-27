import type { TrackerModel } from "#lib/types/tracker.js";

export interface TrackerDevice {
	deviceName: string;
	macAddress: string;
	trackerType: TrackerModel;
	rssi?: number;
}

export interface PairedDevice {
	deviceName: string;
	macAddress: string;
	connected: boolean;
	trackerType: TrackerModel;
}

export type SlotStatus = "paired" | "unpaired" | "pairing";

// one of the two tracker slots on a GX dongle port
export interface PortSlot {
	portId: string;
	status: SlotStatus;
	trackerName: string;
	channel: number;
}
