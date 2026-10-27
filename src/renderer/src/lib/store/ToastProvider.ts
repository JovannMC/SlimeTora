// based on the toast system from VERT (https://github.com/VERT-sh/VERT), which I also wrote
import { writable } from "svelte/store";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
	id: number;
	type: ToastType;
	message: string;
	disappearing: boolean;
	durations: {
		enter: number;
		stay: number;
		exit: number;
	};
}

const toasts = writable<Toast[]>([]);
let nextId = 0;

function addToast(type: ToastType, message: string, disappearing = true, durations?: Toast["durations"]) {
	const id = nextId++;
	const timing = durations ?? {
		enter: 300,
		stay: disappearing ? 5000 : 86400000, // 24h cause why not
		exit: 500,
	};

	toasts.update((list) => [...list, { id, type, message, disappearing, durations: timing }]);
	setTimeout(() => removeToast(id), timing.enter + timing.stay + timing.exit);

	return id;
}

function removeToast(id: number) {
	toasts.update((list) => list.filter((toast) => toast.id !== id));
}

export { addToast, removeToast, toasts };
