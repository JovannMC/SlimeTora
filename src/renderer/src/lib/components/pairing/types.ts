import type { TrackerModel } from "#lib/types/tracker";

export interface TrackerDevice {
	endpointId: string;
	deviceName: string;
	trackerType?: TrackerModel;
	rssi?: number;
}

export interface PairedDevice {
	id: string;
	endpointId: string | undefined;
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
