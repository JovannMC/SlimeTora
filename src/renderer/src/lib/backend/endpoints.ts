import { writable } from "svelte/store";
import type { EndpointDescriptor } from "haritorax-interpreter";

export const knownEndpoints = writable<EndpointDescriptor[]>([]);

export function setKnownEndpoints(endpoints: EndpointDescriptor[]): void {
	knownEndpoints.set(endpoints);
}
