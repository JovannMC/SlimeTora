import type { Quaternion } from "haritorax-interpreter";
import { writable, type Readable, type Writable } from "svelte/store";

export interface TrackerMotion {
	rotation: number[];
	quaternion: Quaternion;
	acceleration: number[];
}

const stores = new Map<string, Writable<TrackerMotion>>();

export function trackerMotion(trackerId: string): Readable<TrackerMotion> {
	const existing = stores.get(trackerId);
	if (existing) return existing;

	const store = writable<TrackerMotion>(
		{ rotation: [0, 0, 0], quaternion: { x: 0, y: 0, z: 0, w: 1 }, acceleration: [0, 0, 0] },
		() => {
			stores.set(trackerId, store);
			return () => {
				if (stores.get(trackerId) === store) stores.delete(trackerId);
			};
		},
	);
	return store;
}

export function setTrackerMotion(trackerId: string, motion: TrackerMotion): void {
	stores.get(trackerId)?.set(motion);
}
