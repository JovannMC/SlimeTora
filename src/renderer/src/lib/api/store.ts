// Stand-in for the Tauri store plugin. Settings are kept in localStorage until
// persistence moves to the Electron main process.

export interface Store {
	get<T = unknown>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown): Promise<void>;
	save(): Promise<void>;
}

export async function load(path: string, _options?: { autoSave?: boolean }): Promise<Store> {
	const storageKey = `slimetora:${path}`;
	const read = (): Record<string, unknown> => JSON.parse(localStorage.getItem(storageKey) ?? "{}");

	return {
		async get<T = unknown>(key: string) {
			return read()[key] as T | undefined;
		},
		async set(key: string, value: unknown) {
			localStorage.setItem(storageKey, JSON.stringify({ ...read(), [key]: value }));
		},
		async save() {},
	};
}
