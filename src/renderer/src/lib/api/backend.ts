export async function invoke<T = unknown>(command: string, _args?: Record<string, unknown>): Promise<T> {
	throw new Error(`Backend command "${command}" is not wired to the Electron main process yet`);
}

export async function listen(_event: string, _handler: (event: { payload: any }) => void): Promise<() => void> {
	return () => {};
}
