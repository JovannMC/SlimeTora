import type { UserActionName } from "$shared/backend/contract";
import { MACAddress, Quaternion, Vector } from "@slimevr/common";
import {
	BoardType,
	FirmwareFeatureFlags,
	MCUType,
	RotationDataType,
	SensorStatus,
	SensorType,
	UserAction,
} from "@slimevr/firmware-protocol";
import { EmulatedTracker, type EmulatedSensor } from "@slimevr/tracker-emulation";
import type { BatteryInfo, DeviceSnapshot, ImuSample } from "haritorax-interpreter";
import { createHash } from "node:crypto";
import { error, info } from "../log";

type MACAddressBytes = [number, number, number, number, number, number];

const USER_ACTIONS: Record<UserActionName, UserAction> = {
	ResetYaw: UserAction.RESET_YAW,
	Reset: UserAction.RESET_FULL,
	ResetMounting: UserAction.RESET_MOUNTING,
	PauseTracking: UserAction.PAUSE_TRACKING,
};

export function macFromSerial(serial: string): MACAddress {
	const bytes = [...createHash("sha256").update(`slimetora:${serial}`).digest().subarray(0, 6)] as MACAddressBytes;
	// locally administered and unicast, so it can't collide with a real vendor MAC
	bytes[0] = (bytes[0] & 0xfe) | 0x02;
	return new MACAddress(bytes);
}

interface EmulatedDevice {
	tracker: EmulatedTracker;
	sensors: EmulatedSensor[];
}

type ServerState = "searching" | "connected" | "disconnected" | "error";

export class SlimeVRBridge {
	readonly #devices = new Map<string, EmulatedDevice>();
	readonly #operations = new Map<string, Promise<void>>();
	readonly #serverStates = new Map<string, ServerState>();

	constructor(
		private readonly onServerState: (deviceId: string, state: ServerState, detail?: string) => void = () => {},
	) {}

	ip = "255.255.255.255";
	port = "6969";

	configure(settings: Record<string, unknown>): void {
		if (settings.slimevrIp) this.ip = settings.slimevrIp as string;
		if (settings.slimevrPort) this.port = settings.slimevrPort as string;

		info(["backend", "slimevr"], `Configured SlimeVR bridge to ${this.ip}:${this.port}`);
	}

	#serialize(deviceId: string, action: () => Promise<void>): Promise<void> {
		const previous = this.#operations.get(deviceId) ?? Promise.resolve();
		const next = previous.catch(() => undefined).then(action);

		this.#operations.set(deviceId, next);

		void next
			.finally(() => {
				if (this.#operations.get(deviceId) === next) this.#operations.delete(deviceId);
			})
			.catch(() => undefined);

		return next;
	}

	deviceConnected(device: DeviceSnapshot): Promise<void> {
		return this.#serialize(device.deviceId, async () => {
			const existing = this.#devices.get(device.deviceId);
			if (existing?.sensors.length === device.imuCount) return;
			if (existing) {
				this.#devices.delete(device.deviceId);
				await existing.tracker.deinit();
			}

			const tracker = new EmulatedTracker(
				macFromSerial(device.deviceId),
				device.version ?? "unknown",
				new FirmwareFeatureFlags(),
				BoardType.UNKNOWN,
				MCUType.UNKNOWN,
				this.ip,
				Number(this.port),
			);

			let initialized = false;
			tracker.on("error", (err) => {
				this.#serverStates.set(device.deviceId, "error");
				this.onServerState(device.deviceId, "error", err.message);
				error(["backend", "slimevr"], `UDP tracker ${device.deviceId} failed: ${String(err)}`);
			});
			tracker.on("searching-for-server", () => {
				this.#serverStates.set(device.deviceId, "searching");
				this.onServerState(device.deviceId, "searching");
			});
			tracker.on("connected-to-server", () => {
				this.#serverStates.set(device.deviceId, "connected");
				this.onServerState(device.deviceId, "connected");
			});
			tracker.on("disconnected-from-server", (reason) => {
				this.#serverStates.set(device.deviceId, "disconnected");
				this.onServerState(device.deviceId, "disconnected", String(reason));
			});

			try {
				await tracker.init();
				initialized = true;
				const sensors: EmulatedSensor[] = [];

				for (let i = 0; i < device.imuCount; i++)
					sensors.push(await tracker.addSensor(SensorType.UNKNOWN, SensorStatus.OK));

				this.#devices.set(device.deviceId, { tracker, sensors });
				this.#serverStates.set(device.deviceId, "searching");
				this.onServerState(device.deviceId, "searching");

				info(
					["backend", "slimevr"],
					`Emulating ${device.deviceId} with MAC ${macFromSerial(device.deviceId).toString()}`,
				);
			} catch (err) {
				this.#serverStates.delete(device.deviceId);
				if (initialized) await tracker.deinit().catch(() => undefined);
				throw err;
			}
		});
	}

	deviceDisconnected(deviceId: string): Promise<void> {
		return this.#serialize(deviceId, async () => {
			const device = this.#devices.get(deviceId);
			if (!device) return;

			this.#devices.delete(deviceId);
			this.#serverStates.delete(deviceId);
			await device.tracker.deinit();
		});
	}

	get serverConnected(): boolean {
		return [...this.#serverStates.values()].some((state) => state === "connected");
	}

	hasDevice(deviceId: string): boolean {
		return this.#devices.has(deviceId);
	}

	imu(sample: ImuSample): void {
		const device = this.#devices.get(sample.deviceId);
		const index = Number(sample.trackerId.split(":")[1]);
		const sensor = device?.sensors[index];
		if (!sensor) return;

		const { rotation, acceleration } = sample;
		sensor
			.sendRotation(RotationDataType.NORMAL, new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w), 0)
			.catch((err) => error(["backend", "slimevr"], `Failed to send rotation: ${String(err)}`));
		sensor
			.sendAcceleration(new Vector(acceleration.x, acceleration.y, acceleration.z))
			.catch((err) => error(["backend", "slimevr"], `Failed to send acceleration: ${String(err)}`));
	}

	battery(battery: BatteryInfo): void {
		const device = this.#devices.get(battery.deviceId);
		if (!device || battery.level === null || battery.voltage === null) return;

		device.tracker
			.changeBatteryLevel(battery.voltage / 1000, battery.level)
			.catch((err) => error(["backend", "slimevr"], `Failed to send battery level: ${String(err)}`));
	}

	sendUserAction(deviceId: string, action: UserActionName): void {
		const device = this.#devices.get(deviceId);
		if (!device) return;

		device.tracker
			.sendUserAction(USER_ACTIONS[action])
			.catch((err) => error(["backend", "slimevr"], `Failed to send user action: ${String(err)}`));
	}

	async dispose(): Promise<void> {
		const devices = new Set([...this.#devices.keys(), ...this.#operations.keys()]);
		await Promise.all([...devices].map((deviceId) => this.deviceDisconnected(deviceId)));
	}
}
