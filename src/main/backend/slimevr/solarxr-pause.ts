import {
	RpcMessage,
	SetPauseTrackingRequestT,
	TrackingPauseStateRequestT,
	TrackingPauseStateResponseT,
} from "../../../../SolarXR-Protocol/protocol/typescript/src/all_generated.js";
import type { SolarXRClient } from "./solarxr-client.js";

export class SolarXRPause {
	#queue = Promise.resolve();
	#active = true;
	#pending?: { paused: boolean; finish: (confirmed: boolean) => void };

	constructor(
		private readonly client: SolarXRClient,
		private readonly onError: (error: unknown) => void,
	) {}

	toggle(): void {
		this.#queue = this.#queue
			.then(() => this.#toggle())
			.catch((error) => {
				if (this.#active) this.onError(error);
			});
	}

	confirm(paused: boolean): void {
		if (this.#pending?.paused === paused) this.#pending.finish(true);
	}

	dispose(): void {
		this.#active = false;
		this.#pending?.finish(false);
	}

	async #toggle(): Promise<void> {
		if (!this.#active) return;
		const { message } = await this.client.requestRpc(
			RpcMessage.TrackingPauseStateRequest,
			new TrackingPauseStateRequestT(),
			RpcMessage.TrackingPauseStateResponse,
		);
		if (!this.#active || !(message instanceof TrackingPauseStateResponseT)) return;

		const confirmed = await this.#setPaused(!message.trackingPaused);
		if (!confirmed && this.#active) throw new Error("SlimeVR did not confirm tracking pause state");
	}

	#setPaused(paused: boolean): Promise<boolean> {
		return new Promise((resolve) => {
			const finish = (confirmed: boolean) => {
				clearTimeout(timer);
				this.#pending = undefined;
				resolve(confirmed);
			};

			const timer = setTimeout(() => finish(false), 5000);
			this.#pending = { paused, finish };

			try {
				this.client.sendRpc(RpcMessage.SetPauseTrackingRequest, new SetPauseTrackingRequestT(paused));
			} catch (error) {
				this.onError(error);
				finish(false);
			}
		});
	}
}
