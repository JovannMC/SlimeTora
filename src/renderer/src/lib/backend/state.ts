import { invoke, listen } from "#lib/api/backend";
import { error } from "#lib/log/index";
import { isOn, restoreRequestedState } from "#lib/store/index";
import type { BackendSnapshot, SessionState } from "$shared/backend/contract";
import { get, writable } from "svelte/store";

export const sessionState = writable<SessionState>({ status: "off", requestedEnabled: false, revision: -1 });
export const backendSnapshot = writable<BackendSnapshot>({
	revision: -1,
	endpoints: [],
	previewEndpoints: [],
	connectedEndpointIds: [],
	devices: [],
	dongleSlots: {},
	dongleChannels: {},
});

let initialState: Promise<void> = Promise.resolve();

export function backendStateLoaded(): Promise<void> {
	return initialState;
}

export function attachBackendState(): () => void {
	let disposed = false;

	function applySession(state: SessionState) {
		if (disposed || state.revision < get(sessionState).revision) return;
		sessionState.set(state);
		if (get(isOn) === null) restoreRequestedState(state.requestedEnabled);
	}

	function applySnapshot(snapshot: BackendSnapshot) {
		if (!disposed && snapshot.revision > get(backendSnapshot).revision) backendSnapshot.set(snapshot);
	}

	const unlisteners = [listen("session", applySession), listen("snapshot", applySnapshot)];
	initialState = Promise.all([
		invoke("getSessionState")
			.then(applySession)
			.catch((err) => {
				if (!disposed) error(["backend"], `Failed to read tracking state: ${err}`);
			}),
		invoke("getSnapshot")
			.then(applySnapshot)
			.catch((err) => {
				if (!disposed) error(["backend"], `Failed to read backend snapshot: ${err}`);
			}),
	]).then(() => undefined);

	return () => {
		disposed = true;
		for (const unlisten of unlisteners) unlisten();
	};
}
