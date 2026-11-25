import type { UserActionName } from "$shared/backend/contract";
import type { SlimeVREndpoint } from "$shared/slimevr-settings";
import type { BatteryInfo, DeviceSnapshot, ImuSample } from "haritorax-interpreter";
import {
	AddTrackerRequestT,
	AddTrackerResponseT,
	AddTrackerStatus,
	DriverMessage,
	QuatT,
	ResetRequestT,
	ResetType,
	RpcMessage,
	BodyPart as SolarXRBodyPart,
	TrackerStatus,
	TrackingPauseStateResponseT,
	UpdateTrackerBatteryT,
	UpdateTrackerPositionT,
	UpdateTrackerStatusT,
	Vec3fT,
} from "../../../../SolarXR-Protocol/protocol/typescript/src/all_generated.js";
import { SolarXRClient, type SolarXRState } from "./solarxr-client.js";
import { SolarXRPause } from "./solarxr-pause.js";

const RESET_TYPES = { ResetYaw: ResetType.YAW, Reset: ResetType.FULL, ResetMounting: ResetType.MOUNTING };
const RETRY_MS = 5000;

type Sensor = {
	active: boolean;
	id?: number;
	registration?: symbol;
	retryAt?: number;
	rotation?: ImuSample["rotation"];
	acceleration?: ImuSample["acceleration"];
};

type Device = {
	battery?: BatteryInfo;
	sensors: Map<string, Sensor>;
	name: string;
	bodyParts: Map<string, SolarXRBodyPart>;
};

type DeviceMetadata = Pick<DeviceSnapshot, "model" | "wiredModel" | "battery" | "trackers">;

const BODY_PARTS: Record<DeviceSnapshot["trackers"][number]["bodyPart"], SolarXRBodyPart> = {
	chest: SolarXRBodyPart.UPPER_CHEST,
	hip: SolarXRBodyPart.HIP,
	leftKnee: SolarXRBodyPart.LEFT_UPPER_LEG,
	leftAnkle: SolarXRBodyPart.LEFT_LOWER_LEG,
	rightKnee: SolarXRBodyPart.RIGHT_UPPER_LEG,
	rightAnkle: SolarXRBodyPart.RIGHT_LOWER_LEG,
	leftElbow: SolarXRBodyPart.LEFT_UPPER_ARM,
	leftWrist: SolarXRBodyPart.LEFT_LOWER_ARM,
	rightElbow: SolarXRBodyPart.RIGHT_UPPER_ARM,
	rightWrist: SolarXRBodyPart.RIGHT_LOWER_ARM,
	leftHand: SolarXRBodyPart.LEFT_HAND,
	rightHand: SolarXRBodyPart.RIGHT_HAND,
	head: SolarXRBodyPart.HEAD,
	leftFoot: SolarXRBodyPart.LEFT_FOOT,
	rightFoot: SolarXRBodyPart.RIGHT_FOOT,
	unassigned: SolarXRBodyPart.NONE,
};

function friendlyModel({ model, wiredModel }: DeviceMetadata): string {
	switch (model) {
		case "x2":
			return "2";
		case "wireless":
			return "Wireless";
		case "wired":
			return wiredModel ?? "Wired";
	}
}

export class SolarXRBridge {
	#client?: SolarXRClient;
	#devices = new Map<string, Device>();
	#pause?: SolarXRPause;

	constructor(
		private readonly onState: (state: SolarXRState) => void,
		private readonly onError: (error: unknown) => void,
	) {}

	get serverConnected(): boolean {
		return this.#client?.state.status === "ready";
	}

	start({ ip, port }: SlimeVREndpoint): void {
		this.dispose();

		const host = ip.includes(":") && !ip.startsWith("[") ? `[${ip}]` : ip;
		const client = new SolarXRClient(`ws://${host}:${port}`, {
			onState: (state) => this.#handleState(client, state),
			onMessage: ({ message, messageType }) => {
				if (
					messageType === RpcMessage.TrackingPauseStateResponse &&
					message instanceof TrackingPauseStateResponseT
				) {
					this.#pause?.confirm(message.trackingPaused);
				}
			},
		});

		this.#client = client;
		try {
			client.start();
		} catch (err) {
			this.#client = undefined;
			this.onError(err);
		}
	}

	imu({ deviceId, trackerId, rotation, acceleration }: ImuSample, metadata: DeviceMetadata): void {
		let device = this.#devices.get(deviceId);
		const name = friendlyModel(metadata);
		if (!device) {
			device = { battery: metadata.battery, sensors: new Map(), name, bodyParts: new Map() };
			this.#devices.set(deviceId, device);
		}

		device.name = name;
		for (const tracker of metadata.trackers) device.bodyParts.set(tracker.trackerId, BODY_PARTS[tracker.bodyPart]);

		let sensor = device.sensors.get(trackerId);
		if (sensor) {
			sensor.active = true;
			sensor.rotation = rotation;
			sensor.acceleration = acceleration;
		} else {
			sensor = { active: true, rotation, acceleration };
			device.sensors.set(trackerId, sensor);
		}

		const client = this.#client;
		if (client?.state.status !== "ready") return;
		if (sensor.id === undefined) void this.#register(client, deviceId, trackerId, device, sensor);
		else this.#sendRotation(client, sensor.id, rotation, acceleration);
	}

	trackerDisconnected(deviceId: string, trackerId: string): void {
		const device = this.#devices.get(deviceId);
		const sensor = device?.sensors.get(trackerId);
		if (!device || !sensor) return;

		sensor.active = false;
		sensor.rotation = undefined;

		const client = this.#client;
		if (client?.state.status === "ready" && sensor.id !== undefined)
			this.#sendStatus(client, sensor.id, TrackerStatus.DISCONNECTED);
		if (!sensor.registration) device.sensors.delete(trackerId);
		if (!device.sensors.size) this.#devices.delete(deviceId);
	}

	deviceDisconnected(deviceId: string): void {
		const device = this.#devices.get(deviceId);
		if (!device) return;

		for (const trackerId of device.sensors.keys()) this.trackerDisconnected(deviceId, trackerId);

		device.battery = undefined;
	}

	battery(battery: BatteryInfo): void {
		const device = this.#devices.get(battery.deviceId);
		if (!device) return;

		device.battery = battery;

		const client = this.#client;
		if (client?.state.status !== "ready") return;

		for (const sensor of device.sensors.values()) {
			if (sensor.active && sensor.id !== undefined) this.#sendBattery(client, sensor.id, battery);
		}
	}

	sendUserAction(deviceId: string, action: UserActionName): void {
		const device = this.#devices.get(deviceId);
		const client = this.#client;
		if (client?.state.status !== "ready" || !device) return;
		if (![...device.sensors.values()].some((sensor) => sensor.active)) return;

		if (action === "PauseTracking") this.#pause?.toggle();
		else this.#send(() => client.sendRpc(RpcMessage.ResetRequest, new ResetRequestT(RESET_TYPES[action])));
	}

	dispose(): void {
		for (const deviceId of this.#devices.keys()) this.deviceDisconnected(deviceId);
		this.#client?.stop();
		this.#client = undefined;
		this.#devices.clear();
	}

	#handleState(client: SolarXRClient, state: SolarXRState): void {
		if (client !== this.#client) return;

		if (state.status === "ready") {
			this.#pause = new SolarXRPause(client, this.onError);
			for (const [deviceId, device] of this.#devices) {
				for (const [trackerId, sensor] of device.sensors) {
					void this.#register(client, deviceId, trackerId, device, sensor);
				}
			}
		} else {
			this.#pause?.dispose();
			this.#pause = undefined;
			this.#resetRegistrations();
		}
		this.onState(state);
	}

	#resetRegistrations(): void {
		for (const [deviceId, device] of this.#devices) {
			for (const [trackerId, sensor] of device.sensors) {
				if (!sensor.active) {
					device.sensors.delete(trackerId);
					continue;
				}

				sensor.id = undefined;
				sensor.registration = undefined;
				sensor.retryAt = undefined;
			}
			if (!device.sensors.size) this.#devices.delete(deviceId);
		}
	}

	async #register(
		client: SolarXRClient,
		deviceId: string,
		trackerId: string,
		device: Device,
		sensor: Sensor,
	): Promise<void> {
		if (!sensor.active || sensor.registration || (sensor.retryAt ?? 0) > Date.now()) return;

		const attempt = Symbol();
		sensor.registration = attempt;
		const isCurrent = () => this.#client === client && sensor.registration === attempt;
		try {
			const trackerNumber = Number(trackerId.slice(deviceId.length + 1)) + 1;
			const bodyPart = device.bodyParts.get(trackerId) ?? SolarXRBodyPart.NONE;
			const request = new AddTrackerRequestT(
				`slimetora:${trackerId}`,
				`HaritoraX ${device.name} (${deviceId}, ${trackerNumber})`,
				"Shiftall",
				bodyPart,
			);
			const { message } = await client.requestDriver(
				DriverMessage.AddTrackerRequest,
				request,
				DriverMessage.AddTrackerResponse,
			);
			if (!isCurrent()) return;
			if (
				!(message instanceof AddTrackerResponseT) ||
				!message.trackerId ||
				(message.status !== AddTrackerStatus.CREATED && message.status !== AddTrackerStatus.ALREADY_EXISTS)
			) {
				throw new Error(`SlimeVR rejected tracker ${trackerId}`);
			}

			const id = message.trackerId;
			if (!sensor.active) {
				this.#sendStatus(client, id, TrackerStatus.DISCONNECTED);
				return;
			}
			if (!this.#sendStatus(client, id, TrackerStatus.OK)) {
				sensor.retryAt = Date.now() + RETRY_MS;
				return;
			}

			sensor.id = id;
			if (device.battery) this.#sendBattery(client, id, device.battery);
			if (sensor.rotation) this.#sendRotation(client, id, sensor.rotation, sensor.acceleration);
		} catch (error) {
			if (isCurrent() && sensor.active) {
				sensor.retryAt = Date.now() + RETRY_MS;
				this.onError(error);
			}
		} finally {
			if (isCurrent()) {
				sensor.registration = undefined;

				if (!sensor.active) {
					device.sensors.delete(trackerId);
					if (!device.sensors.size) this.#devices.delete(deviceId);
				}
			}
		}
	}

	#sendStatus(client: SolarXRClient, id: number, status: TrackerStatus): boolean {
		return this.#send(() =>
			client.sendDriver(DriverMessage.UpdateTrackerStatus, new UpdateTrackerStatusT(id, status)),
		);
	}

	#sendBattery(client: SolarXRClient, id: number, battery: BatteryInfo): void {
		if (battery.level === null || !Number.isFinite(battery.level)) return;

		const level = Math.round(Math.min(100, Math.max(0, battery.level)));
		this.#send(() =>
			client.sendDriver(
				DriverMessage.UpdateTrackerBattery,
				new UpdateTrackerBatteryT(id, level, battery.chargeStatus === "charging"),
			),
		);
	}

	#sendRotation(
		client: SolarXRClient,
		id: number,
		{ x, y, z, w }: ImuSample["rotation"],
		acceleration?: ImuSample["acceleration"],
	): void {
		const c = Math.SQRT1_2;
		const rotation = new QuatT((x - w) * c, (y + z) * c, (z - y) * c, (w + x) * c);

		// rotate sensor-local acceleration into the server's world coordinate frame
		let linearAcceleration: Vec3fT | null = null;
		if (acceleration) {
			let { x: qx, y: qy, z: qz, w: qw } = rotation;
			let normSquared = qx * qx + qy * qy + qz * qz + qw * qw;

			if (normSquared < 1e-300 || normSquared > 1e300) {
				const norm = Math.hypot(qx, qy, qz, qw);
				if (Number.isFinite(norm) && norm > 0) {
					qx /= norm;
					qy /= norm;
					qz /= norm;
					qw /= norm;
					normSquared = 1;
				} else {
					normSquared = 0;
				}
			}

			if (Number.isFinite(normSquared) && normSquared > 0) {
				const { x: ax, y: ay, z: az } = acceleration;
				const scale = 2 / normSquared;
				const tx = qy * az - qz * ay;
				const ty = qz * ax - qx * az;
				const tz = qx * ay - qy * ax;
				linearAcceleration = new Vec3fT(
					ax + scale * (qw * tx + qy * tz - qz * ty),
					ay + scale * (qw * ty + qz * tx - qx * tz),
					az + scale * (qw * tz + qx * ty - qy * tx),
				);
			}
		}

		this.#send(() =>
			client.sendDriver(
				DriverMessage.UpdateTrackerPosition,
				new UpdateTrackerPositionT(id, rotation, null, null, null, linearAcceleration),
			),
		);
	}

	#send(send: () => void): boolean {
		try {
			send();
			return true;
		} catch (err) {
			this.onError(err);
			return false;
		}
	}
}
