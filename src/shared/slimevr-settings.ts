export type SlimeVRTransport = "auto" | "solarxr" | "udp";
export type SlimeVREndpoint = { ip: string; port: number };
export type SlimeVRSettings = { transport: SlimeVRTransport; solarxr: SlimeVREndpoint; udp: SlimeVREndpoint };

export const DEFAULT_SOLARXR_ENDPOINT = { ip: "127.0.0.1", port: 21110 };
export const DEFAULT_UDP_ENDPOINT = { ip: "255.255.255.255", port: 6969 };
