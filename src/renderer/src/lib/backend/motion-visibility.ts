import { invoke } from "#lib/api/backend";
import { isBridgeAvailable } from "#lib/api/bridge";
import { error } from "#lib/log/index";

const elements = new Map<HTMLElement, { trackerId: string; visible: boolean }>();
let observer: IntersectionObserver | undefined;
let queued = false;
let lastSent: string | undefined;
let active = false;
let focused = false;

function syncVisibleTrackers() {
	if (queued) return;
	queued = true;
	queueMicrotask(() => {
		queued = false;
		const trackerIds =
			!active || !focused || document.hidden
				? []
				: [
						...new Set(
							[...elements.values()].filter((entry) => entry.visible).map((entry) => entry.trackerId),
						),
					].sort();
		const serialized = JSON.stringify(trackerIds);
		if (serialized === lastSent || !isBridgeAvailable()) return;

		lastSent = serialized;

		void invoke("setVisibleTrackers", trackerIds).catch((err) => {
			lastSent = undefined;
			error(["trackers", "visibility"], `Failed to update visible trackers: ${String(err)}`);
		});
	});
}

function onFocus() {
	focused = true;
	syncVisibleTrackers();
}

function onBlur() {
	focused = false;
	syncVisibleTrackers();
}

export function attachMotionVisibility() {
	active = true;
	lastSent = undefined;
	syncVisibleTrackers();
	return () => {
		active = false;
		syncVisibleTrackers();
	};
}

export function observeTrackerMotion(element: HTMLElement, trackerId: string) {
	if (elements.size === 0) {
		focused = document.hasFocus();
		window.addEventListener("focus", onFocus);
		window.addEventListener("blur", onBlur);
		document.addEventListener("visibilitychange", syncVisibleTrackers);
		if (typeof IntersectionObserver !== "undefined") {
			observer = new IntersectionObserver((entries) => {
				for (const entry of entries) {
					const item = elements.get(entry.target as HTMLElement);
					if (item) item.visible = entry.isIntersecting;
				}
				syncVisibleTrackers();
			});
		}
	}

	elements.set(element, { trackerId, visible: !observer });
	observer?.observe(element);
	syncVisibleTrackers();

	return {
		destroy() {
			observer?.unobserve(element);
			elements.delete(element);
			if (elements.size === 0) {
				observer?.disconnect();
				observer = undefined;
				window.removeEventListener("focus", onFocus);
				window.removeEventListener("blur", onBlur);
				document.removeEventListener("visibilitychange", syncVisibleTrackers);
			}
			syncVisibleTrackers();
		},
	};
}
