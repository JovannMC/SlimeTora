import type { BridgeProvider } from "#lib/api/bridge";
import type { PlatformBridge } from "$shared/ipc/channels";

export const electronBridge: BridgeProvider = {
	get isAvailable() {
		return typeof window !== "undefined" && window.slimetora !== undefined;
	},

	get(): PlatformBridge {
		const bridge = window.slimetora;
		if (!bridge) throw new Error("Electron preload bridge is unavailable");
		return bridge;
	},
};
