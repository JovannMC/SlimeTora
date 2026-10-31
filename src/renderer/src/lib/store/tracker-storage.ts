import { load, type Store } from "#lib/api/store";

let config: Promise<Store> | undefined;
let writeQueue = Promise.resolve();

export function trackerStore(): Promise<Store> {
	config ??= load("trackers.json");
	return config;
}

export function updateTrackerStore<T>(key: string, update: (current: T | undefined) => T): Promise<T> {
	const task = writeQueue.then(async () => {
		const store = await trackerStore();
		const current = await store.get<T>(key);
		const next = update(current);
		if (!Object.is(next, current)) await store.set(key, next);
		return next;
	});
	writeQueue = task.then(
		() => undefined,
		() => undefined,
	);
	return task;
}
