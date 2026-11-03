import { getBridge } from "#lib/api/bridge";
import { refreshTranslations } from "#lib/lang/index";
import { program } from "#lib/store/settings";
import type { PlatformBridge } from "$shared/ipc/channels";
import type { AppUpdate } from "$shared/updates";
import { get, writable } from "svelte/store";

export const appUpdate = writable<AppUpdate>(null);
export const updateStatus = writable<{ checking: boolean; app: string; language: string }>({
	checking: false,
	app: "",
	language: "",
});

export async function checkUpdates(app: boolean, language: boolean): Promise<void> {
	if (get(updateStatus).checking) return;

	updateStatus.set({ checking: true, app: "", language: "" });
	appUpdate.set(null);

	const bridge = getBridge();

	await Promise.all([
		app ? updateApp(bridge) : Promise.resolve(),
		language ? updateLanguage(bridge) : Promise.resolve(),
	]);

	updateStatus.update((s) => ({ ...s, checking: false }));
}

async function updateApp(bridge: PlatformBridge): Promise<void> {
	try {
		const result = await bridge.checkAppUpdate(get(program).updateChannel === "beta" ? "beta" : "stable");

		appUpdate.set(result);
		updateStatus.update((s) => ({ ...s, app: result ? "available" : "current" }));
	} catch {
		updateStatus.update((s) => ({ ...s, app: "failed" }));
	}
}

async function updateLanguage(bridge: PlatformBridge): Promise<void> {
	try {
		const count = await bridge.checkLanguages();

		updateStatus.update((s) => ({ ...s, language: count ? "updated" : "current" }));
	} catch {
		updateStatus.update((s) => ({ ...s, language: "failed" }));
	} finally {
		try {
			await refreshTranslations();
		} catch {
			updateStatus.update((s) => ({ ...s, language: "failed" }));
		}
	}
}
