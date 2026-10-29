export interface Store {
	get<T = unknown>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown): Promise<void>;
	save(): Promise<void>;
}

export async function load(path: string, _options?: { autoSave?: boolean }): Promise<Store> {
	const storeKey = `slimetora:${path}`;

	return {
		async get<T = unknown>(key: string) {
			const data: Record<string, unknown> = ((await window.slimetora!.getSetting(storeKey)) as Record<
				string,
				unknown
			>) ?? {};
			return data[key] as T | undefined;
		},
		async set(key: string, value: unknown) {
			const data: Record<string, unknown> = ((await window.slimetora!.getSetting(storeKey)) as Record<
				string,
				unknown
			>) ?? {};
			data[key] = value;
			await window.slimetora!.setSetting(storeKey, data);
		},
		async save() {
			// No-op: IPC calls are synchronous from the main process perspective
		},
	};
}
