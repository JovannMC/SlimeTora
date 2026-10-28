import { invoke } from "#lib/api/backend";
import { error, info } from "#lib/log/index";
import { activeModes, settings } from "#lib/store/index";
import { ConnectionMode } from "#lib/types/connection";
import { TrackerModel } from "#lib/types/tracker";
import { get } from "svelte/store";
import { Notification, Notifications } from "./notifications";

let notification: Notification | null = null;

export async function startInterpreting() {
	if (!notification) notification = new Notification();

	const modes = get(settings.connection).modes as ConnectionMode[];
	const models = get(settings.connection).models as TrackerModel[];
	const ports = get(settings.connection).ports as string[];
	const macAddresses = get(settings.connection).macAddresses as string[];

	if (modes.length === 0 || !models) {
		return error(["backend"], "No modes or model selected for connection");
	}

	if (modes.includes(ConnectionMode.Serial) && ports.length === 0) {
		return error(["backend"], "No ports selected for serial connection");
	}

	info(
		["backend"],
		`Starting interpreting with modes: ${modes}, models: ${models}, ports: ${ports}, macs: ${macAddresses}`,
	);

	for (const model of models) {
		await invoke("start_connection", { model, modes, ports, macAddresses });
	}
	activeModes.set(modes);

	for (const notif of Notifications) {
		await notification.start(notif);
	}

	let activeNotifications = notification.getActiveNotifications();
	info(["backend"], `Active notifications started: ${activeNotifications.join(", ")}`);
}

export async function stopInterpreting() {
	const models = get(settings.connection).models as TrackerModel[];
	const modes = get(activeModes);

	info(["backend"], `Stopping interpreting with modes: ${modes}, model: ${models}`);

	if (modes.length === 0) {
		return error(["backend"], "No modes to stop");
	}

	await invoke("stop_connection", { models, modes });

	if (notification === null) return error(["backend"], "No notification instance to stop");
	const activeNotifications = notification.getActiveNotifications();
	if (activeNotifications.length === 0) return error(["backend"], "No active notifications to stop");

	info(["backend"], `Stopping notifications: ${activeNotifications.join(", ")}`);

	for (const notif of activeNotifications) {
		notification.stop(notif);
	}
	notification = null;
}
