import type { Component } from "svelte";

export type ToastType = "success" | "error" | "info" | "warning";

type BaseToast = {
	id: number;
	type: ToastType;
	disappearing: boolean;
	durations: {
		enter: number;
		stay: number;
		exit: number;
	};
};

export type StringToast = BaseToast & {
	message: string;
};

export type ComponentToast<T> = BaseToast & {
	message: ToastComponent<T>;
	additional: T;
};

export type Toast<T = unknown> = StringToast | ComponentToast<T>;

export type ToastProps<T = unknown> = Omit<ComponentToast<T>, "disappearing">;

export type ToastExports = {
	title?: string;
};

export type ToastComponent<T> = Component<ToastProps<T>, ToastExports>;

type RecursivePartial<T> = {
	[P in keyof T]?: T[P] extends (infer U)[]
		? RecursivePartial<U>[]
		: T[P] extends object | undefined
			? RecursivePartial<T[P]>
			: T[P];
};

type BaseToastOptions = Omit<RecursivePartial<BaseToast>, "id"> & {
	disappearing?: boolean;
};

export type StringToastOptions = BaseToastOptions & {
	message: string;
};

export type ComponentToastOptions<T> = BaseToastOptions & {
	message: ToastComponent<T>;
	additional: T;
};

export type ToastOptions<T = unknown> = StringToastOptions | ComponentToastOptions<T>;

const durationDefault = (disappearing: boolean) => ({
	enter: 300,
	stay: disappearing ? 5000 : 86400000, // 24h cause why not
	exit: 500,
});

class ToastState {
	private pId = $state(0);
	private pToasts = $state<Toast<unknown>[]>([]);

	public add<T>(toast: Toast<T>) {
		this.pToasts.push(toast as Toast<unknown>);
	}

	public remove(id: number) {
		this.pToasts = this.pToasts.filter((toast) => toast.id !== id);
	}

	public id(): number {
		return this.pId++;
	}

	public get toasts() {
		return this.pToasts;
	}
}

export class ToastManager {
	static pToasts = new ToastState();

	public static add<T = unknown>(toastOptions: ToastOptions<T>): number {
		const id = this.pToasts.id();
		const {
			type = "info",
			disappearing = true,
			durations: d = durationDefault(toastOptions.disappearing ?? true),
		} = toastOptions;
		const durations = {
			...durationDefault(disappearing),
			...d,
		};

		if (typeof toastOptions.message === "string") {
			const newToast: StringToast = {
				id,
				type,
				message: toastOptions.message,
				disappearing,
				durations,
			};

			this.pToasts.add(newToast);
		} else {
			const newToast: ComponentToast<T> = {
				id,
				type,
				message: toastOptions.message,
				disappearing,
				durations,
				additional: (toastOptions as ComponentToastOptions<T>).additional,
			};

			this.pToasts.add(newToast);
		}

		setTimeout(
			() => {
				this.remove(id);
			},
			durations.enter + durations.stay + durations.exit,
		);
		return id;
	}

	public static remove(id: number) {
		this.pToasts.remove(id);
	}

	public static get toasts() {
		return this.pToasts.toasts;
	}
}
