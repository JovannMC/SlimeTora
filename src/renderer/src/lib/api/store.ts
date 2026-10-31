export interface Store {
	get<T = unknown>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown): Promise<void>;
}

const writeQueues = new Map<string, Promise<void>>();

export async function load(path: string): Promise<Store> {
	return {
		async get<T = unknown>(key: string) {
			const data: Record<string, unknown> =
				((await window.slimetora!.getSetting(path)) as Record<string, unknown>) ?? {};
			return data[key] as T | undefined;
		},
		async set(key: string, value: unknown) {
			const previous = writeQueues.get(path) ?? Promise.resolve();
			const next = previous
				.catch(() => undefined)
				.then(async () => {
					const data: Record<string, unknown> =
						((await window.slimetora!.getSetting(path)) as Record<string, unknown>) ?? {};
					data[key] = value;
					await window.slimetora!.setSetting(path, data);
				});
			writeQueues.set(path, next);
			try {
				await next;
			} finally {
				if (writeQueues.get(path) === next) writeQueues.delete(path);
			}
		},
	};
}
