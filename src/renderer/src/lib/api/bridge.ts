import type { PlatformBridge } from "$shared/ipc/channels";

export interface BridgeProvider {
	readonly isAvailable: boolean;
	get(): PlatformBridge;
}

let provider: BridgeProvider | undefined;

export function registerBridge(next: BridgeProvider): void {
	provider = next;
}

export function getBridge(): PlatformBridge {
	if (!provider) throw new Error("No platform bridge registered");
	return provider.get();
}

export function isBridgeAvailable(): boolean {
	return provider?.isAvailable ?? false;
}
