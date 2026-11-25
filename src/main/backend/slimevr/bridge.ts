import type { UserActionName } from "$shared/backend/contract";
import type { SlimeVREndpoint, SlimeVRSettings } from "$shared/slimevr-settings";
import type { BatteryInfo, DeviceSnapshot, ImuSample } from "haritorax-interpreter";
import type { SolarXRState } from "./solarxr-client.js";
import { SolarXRBridge } from "./solarxr.js";
import type { UdpBridge } from "./udp.js";

type UdpTransport = Pick<
	UdpBridge,
	"serverConnected" | "deviceConnected" | "deviceDisconnected" | "imu" | "battery" | "sendUserAction" | "dispose"
>;

type UdpDevice = {
	snapshot: DeviceSnapshot;
	latest: Map<string, ImuSample>;
	battery?: BatteryInfo;
	registeredImuCount?: number;
	initializing?: boolean;
	retryAt?: number;
};

type ConnectionOptions = {
	createUdp: (endpoint: SlimeVREndpoint, onState: () => void) => UdpTransport;
	onState: () => void;
	onSolarXRState: (state: SolarXRState) => void;
	onResetStarted: () => void;
	onFallback: () => void;
	onError: (error: unknown) => void;
	probeMs?: number;
};

export class SlimeVRConnection {
	#solarxr: SolarXRBridge;
	#udp?: UdpTransport;
	#udpDevices = new Map<string, UdpDevice>();
	#probe?: ReturnType<typeof setTimeout>;
	#mode?: "solarxr" | "udp";

	constructor(private readonly options: ConnectionOptions) {
		this.#solarxr = new SolarXRBridge(
			(state) => {
				if (state.status === "ready" || state.status === "rejected") this.#clearProbe();
				options.onSolarXRState(state);
				options.onState();
			},
			options.onError,
			options.onState,
			options.onResetStarted,
		);
	}

	get serverConnected(): boolean {
		return this.#mode === "solarxr" ? this.#solarxr.serverConnected : (this.#udp?.serverConnected ?? false);
	}

	get transport(): "solarxr" | "udp" | undefined {
		return this.#mode;
	}

	get diagnostics() {
		return this.#mode === "solarxr" ? this.#solarxr.diagnostics : undefined;
	}

	start(settings: SlimeVRSettings): void {
		if (this.#mode) return;
		if (settings.transport === "udp") {
			this.#startUdp(settings.udp);
			return;
		}
		this.#mode = "solarxr";
		if (settings.transport === "auto") {
			this.#probe = setTimeout(() => {
				this.#probe = undefined;
				this.#solarxr.dispose();

				this.#startUdp(settings.udp);
				this.options.onFallback();

				for (const device of this.#udpDevices.values()) void this.#initializeUdp(device);
			}, this.options.probeMs ?? 5000);
		}
		this.#solarxr.start(settings.solarxr);
	}

	imu(sample: ImuSample, snapshot: DeviceSnapshot): void {
		if (this.#mode === "solarxr") this.#solarxr.imu(sample, snapshot);
		if (!this.#probe && this.#mode !== "udp") return;

		let device = this.#udpDevices.get(sample.deviceId);
		if (!device) {
			device = { snapshot, latest: new Map(), battery: snapshot.battery };
			this.#udpDevices.set(sample.deviceId, device);
		} else {
			device.snapshot = snapshot;
		}
		device.latest.set(sample.trackerId, sample);

		if (!this.#udp) return;

		if (device.registeredImuCount === snapshot.imuCount && !device.initializing) this.#udp.imu(sample, snapshot);
		else void this.#initializeUdp(device);
	}

	trackerDisconnected(deviceId: string, trackerId: string): void {
		if (this.#mode === "solarxr") this.#solarxr.trackerDisconnected(deviceId, trackerId);

		const device = this.#udpDevices.get(deviceId);
		if (!device) return;

		device.latest.delete(trackerId);
		if (!device.latest.size) this.deviceDisconnected(deviceId);
	}

	deviceDisconnected(deviceId: string): void {
		if (this.#mode === "solarxr") this.#solarxr.deviceDisconnected(deviceId);
		if (this.#udpDevices.delete(deviceId)) void this.#udp?.deviceDisconnected(deviceId).catch(this.options.onError);
	}

	battery(battery: BatteryInfo): void {
		if (this.#mode === "solarxr") this.#solarxr.battery(battery);

		const device = this.#udpDevices.get(battery.deviceId);
		if (!device) return;

		device.battery = battery;
		this.#udp?.battery(battery);
	}

	sendUserAction(deviceId: string, action: UserActionName): void {
		if (this.#mode === "solarxr") this.#solarxr.sendUserAction(deviceId, action);
		else this.#udp?.sendUserAction(deviceId, action);
	}

	async dispose(): Promise<void> {
		this.#clearProbe();
		this.#mode = undefined;
		this.#solarxr.dispose();

		const udp = this.#udp;
		this.#udp = undefined;
		this.#udpDevices.clear();
		await udp?.dispose();
	}

	#clearProbe(): void {
		clearTimeout(this.#probe);
		this.#probe = undefined;
		if (this.#mode === "solarxr") this.#udpDevices.clear();
	}

	#startUdp(endpoint: SlimeVREndpoint): void {
		this.#mode = "udp";
		const udp = this.options.createUdp(endpoint, () => {
			if (udp === this.#udp) this.options.onState();
		});
		this.#udp = udp;
		this.options.onState();
	}

	async #initializeUdp(device: UdpDevice): Promise<void> {
		const udp = this.#udp;
		if (!udp || device.initializing || (device.retryAt ?? 0) > Date.now()) return;

		const { snapshot } = device;
		const isCurrent = () => udp === this.#udp && this.#udpDevices.get(snapshot.deviceId) === device;
		device.initializing = true;
		try {
			await udp.deviceConnected(snapshot);
			if (!isCurrent()) return;

			device.registeredImuCount = snapshot.imuCount;
			if (device.battery) udp.battery(device.battery);
			for (const sample of device.latest.values()) udp.imu(sample, device.snapshot);
		} catch (error) {
			if (!isCurrent()) return;
			device.registeredImuCount = undefined;
			device.retryAt = Date.now() + 5000;
			this.options.onError(error);
			return;
		} finally {
			device.initializing = false;
		}

		// A new snapshot may have arrived while the UDP trackers were being created.
		if (isCurrent() && snapshot.imuCount !== device.snapshot.imuCount) {
			void this.#initializeUdp(device);
		}
	}
}
