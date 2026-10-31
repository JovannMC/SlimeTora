import { getBridge, isBridgeAvailable } from "#lib/api/bridge";
import type { AppInfo } from "$shared/ipc/channels";
import { error } from "#lib/log/index";
import { writable } from "svelte/store";

export const platform = writable<AppInfo["platform"] | null>(null);

let loading: Promise<void> | undefined;

export function loadPlatform(): Promise<void> {
	loading ??= (async () => {
		try {
			if (!isBridgeAvailable()) return;
			platform.set((await getBridge().getAppInfo()).platform);
		} catch (err) {
			error(["store", "platform"], `Failed to detect platform: ${err}`);
		}
	})();
	return loading;
}
