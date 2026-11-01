const UI_IMU_INTERVAL_MS = 50;

// forwarding IMU data to renderer (not SlimeVR)
export function createImuForwarding() {
	let fastData = false;
	let visibleTrackers = new Set<string>();
	const lastSentAt = new Map<string, number>();

	return {
		setFastData(enabled: boolean) {
			if (fastData === enabled) return;
			fastData = enabled;
			lastSentAt.clear();
		},
		setVisibleTrackers(trackerIds: string[]) {
			const next = new Set(trackerIds);
			for (const trackerId of next) if (!visibleTrackers.has(trackerId)) lastSentAt.delete(trackerId);
			visibleTrackers = next;
		},
		shouldSend(trackerId: string, now = performance.now()): boolean {
			if (!visibleTrackers.has(trackerId)) return false;
			if (fastData) return true;
			const last = lastSentAt.get(trackerId);
			if (last !== undefined && now - last < UI_IMU_INTERVAL_MS) return false;
			lastSentAt.set(trackerId, now);
			return true;
		},
		forget(trackerId: string) {
			lastSentAt.delete(trackerId);
		},
		reset() {
			lastSentAt.clear();
		},
	};
}
