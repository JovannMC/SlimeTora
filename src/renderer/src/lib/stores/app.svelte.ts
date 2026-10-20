import { getBridge, isBridgeAvailable } from "#lib/api/bridge";
import type { AppInfo, Capabilities } from "$shared/ipc/channels";

class AppState {
    info = $state<AppInfo | null>(null);
    capabilities = $state<Capabilities | null>(null);
    loading = $state(true);
    error = $state<string | null>(null);

    async load(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            if (!isBridgeAvailable()) throw new Error("Running outside the desktop shell");
            const bridge = getBridge();
            [this.info, this.capabilities] = await Promise.all([bridge.getAppInfo(), bridge.getCapabilities()]);
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
            console.error(`[appState] Failed to load app state: ${this.error}`);
        } finally {
            this.loading = false;
        }
    }
}

export const appState = new AppState();
