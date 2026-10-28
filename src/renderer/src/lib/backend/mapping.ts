import { ConnectionMode, type ConnectionMode as Mode } from "#lib/types/connection";
import { MagStatus, TrackerModel } from "#lib/types/tracker";
import type {
	ConnectionKind,
	MagStatus as LibraryMagStatus,
	TrackerModel as LibraryModel,
} from "haritorax-interpreter";

export const MODEL_FROM_LIBRARY: Record<LibraryModel, TrackerModel> = {
	x2: TrackerModel.X2,
	wireless: TrackerModel.Wireless,
	wired: TrackerModel.Wired,
};

export const MODE_FROM_LIBRARY: Record<ConnectionKind, Mode> = {
	ble: ConnectionMode.BLE,
	serial: ConnectionMode.Serial,
};

export const MAG_FROM_LIBRARY: Record<LibraryMagStatus, MagStatus> = {
	great: MagStatus.GREAT,
	okay: MagStatus.OKAY,
	bad: MagStatus.BAD,
	veryBad: MagStatus.VERY_BAD,
	unknown: MagStatus.Unknown,
};
