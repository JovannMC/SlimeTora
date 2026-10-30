import type { EndpointDescriptor, HaritoraX } from "haritorax-interpreter";

type DiscoveryBackend = Pick<HaritoraX, "discover" | "stopDiscovery">;

export function createDiscoveryController(getBackend: () => Promise<DiscoveryBackend>) {
	let pending: Promise<EndpointDescriptor[]> | undefined;
	let stopping: Promise<void> | undefined;

	function discover(): Promise<EndpointDescriptor[]> {
		if (stopping) return stopping.then(discover);
		if (pending) return pending;

		pending = getBackend()
			.then((backend) => backend.discover({ timeoutMs: 5_000 }))
			.finally(() => {
				pending = undefined;
			});
		return pending;
	}

	function stopDiscovery(): Promise<void> {
		if (stopping) return stopping;
		const scan = pending;
		if (!scan) return Promise.resolve();

		stopping = getBackend()
			.then(async (backend) => {
				await backend.stopDiscovery();
				await scan.catch(() => undefined);
			})
			.finally(() => {
				stopping = undefined;
			});
		return stopping;
	}

	return { discover, stopDiscovery };
}
