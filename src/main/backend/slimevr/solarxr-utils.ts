import { Builder, ByteBuffer } from "flatbuffers";
import {
	MessageBundle,
	type MessageBundleT,
} from "../../../../SolarXR-Protocol/protocol/typescript/src/solarxr-protocol/message-bundle.js";

export function encodeSolarXRBundle(bundle: MessageBundleT): Uint8Array {
	const builder = new Builder(256);
	builder.finish(bundle.pack(builder));
	return builder.asUint8Array();
}

export function decodeSolarXRBundle(bytes: Uint8Array): MessageBundle {
	return MessageBundle.getRootAsMessageBundle(new ByteBuffer(bytes));
}
