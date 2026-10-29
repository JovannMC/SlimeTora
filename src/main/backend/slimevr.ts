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

export class SlimeVRBridge {
	readonly #devices = new Map<string, EmulatedDevice>();

	ip = "255.255.255.255";
	port = "6969";

	configure(settings: Record<string, unknown>): void {
		if (settings.slimevrIp) this.ip = settings.slimevrIp as string;
		if (settings.slimevrPort) this.port = settings.slimevrPort as string;

		info(["backend", "slimevr"], `Configured SlimeVR bridge to ${this.ip}:${this.port}`);
	}

	async deviceConnected(device: DeviceSnapshot): Promise<void> {
		if (this.#devices.has(device.deviceId)) return;

		const tracker = new EmulatedTracker(
			macFromSerial(device.deviceId),
			device.version ?? "unknown",
			new FirmwareFeatureFlags(),
			BoardType.UNKNOWN,
			MCUType.UNKNOWN,
			this.ip,
			Number(this.port),
		);
		console.log(`ip: ${this.ip}, port: ${Number(this.port)}`);
		await tracker.init();

		const sensors: EmulatedSensor[] = [];
		for (let i = 0; i < device.imuCount; i++) {
			sensors.push(await tracker.addSensor(SensorType.UNKNOWN, SensorStatus.OK));
		}

		this.#devices.set(device.deviceId, { tracker, sensors });
		info(
			["backend", "slimevr"],
			`Emulating ${device.deviceId} with MAC ${macFromSerial(device.deviceId).toString()}`,
		);
	}

	async deviceDisconnected(deviceId: string): Promise<void> {
		const device = this.#devices.get(deviceId);
		if (!device) return;

		this.#devices.delete(deviceId);
		await device.tracker.deinit();
	}

	imu(sample: ImuSample): void {
		const device = this.#devices.get(sample.deviceId);
		const index = Number(sample.trackerId.split(":")[1]);
		const sensor = device?.sensors[index];
		if (!sensor) return;

		const { rotation, acceleration } = sample;
		sensor
			.sendRotation(RotationDataType.NORMAL, new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w), 0)
			.catch((err) => error(["backend", "slimevr"], "Failed to send rotation:", err));
		sensor
			.sendAcceleration(new Vector(acceleration.x, acceleration.y, acceleration.z))
			.catch((err) => error(["backend", "slimevr"], "Failed to send acceleration:", err));
	}

	battery(battery: BatteryInfo): void {
		const device = this.#devices.get(battery.deviceId);
		if (!device || battery.level === null || battery.voltage === null) return;

		device.tracker
			.changeBatteryLevel(battery.voltage, battery.level)
			.catch((err) => error(["backend", "slimevr"], "Failed to send battery level:", err));
	}

	sendUserAction(deviceId: string, action: UserActionName): void {
		const device = this.#devices.get(deviceId);
		if (!device) return;

		device.tracker
			.sendUserAction(USER_ACTIONS[action])
			.catch((err) => error(["backend", "slimevr"], "Failed to send user action:", err));
	}

	async dispose(): Promise<void> {
		const devices = [...this.#devices.keys()];
		await Promise.all(devices.map((deviceId) => this.deviceDisconnected(deviceId)));
	}
}
