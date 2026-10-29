import { invoke } from "#lib/api/backend";
import { error } from "#lib/log/index";
import { get, writable } from "svelte/store";
import type { EndpointDescriptor } from "haritorax-interpreter";

export const knownEndpoints = writable<EndpointDescriptor[]>([]);

export function setKnownEndpoints(endpoints: EndpointDescriptor[]): void {
	knownEndpoints.set(endpoints);
}

export async function refreshEndpoints(): Promise<EndpointDescriptor[]> {
	try {
		const endpoints = await invoke("discover");
		knownEndpoints.set(endpoints);
		return endpoints;
	} catch (err) {
		error(["backend", "endpoints"], `Failed to discover endpoints: ${err}`);
		return get(knownEndpoints);
	}
}
