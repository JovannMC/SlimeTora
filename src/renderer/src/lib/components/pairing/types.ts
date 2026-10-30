import type { TrackerModel } from "#lib/types/tracker";
import type { ConnectionKind } from "haritorax-interpreter";

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
	connectedVia?: ConnectionKind;
	trackerType?: TrackerModel;
	bodyPart?: string;
	confirmed: boolean;
}

export type SlotStatus = "paired" | "unpaired" | "pairing" | "detected" | "unknown";

// one of the two tracker slots on a GX dongle port
export interface PortSlot {
	portId: string;
	status: SlotStatus;
	trackerName: string;
	bodyPart: string;
}
