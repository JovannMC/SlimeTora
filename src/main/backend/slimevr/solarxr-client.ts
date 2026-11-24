import {
	DriverMessage,
	DriverMessageHeaderT,
	HandshakeRequestT,
	HandshakeResponseT,
	HandshakeStatus,
	MessageBundleT,
	RpcMessage,
	RpcMessageHeaderT,
} from "../../../../SolarXR-Protocol/protocol/typescript/src/all_generated.js";
import { decodeSolarXRBundle, encodeSolarXRBundle } from "./solarxr-utils.js";

export type SolarXRState =
	| { status: "stopped" | "connecting" | "waiting" | "handshaking" | "ready" }
	| { status: "rejected"; reason: HandshakeStatus }
	| { status: "disconnected"; reason: string };

const MAX_BUFFERED_BYTES = 256 * 1024;

type Header = DriverMessageHeaderT | RpcMessageHeaderT;
type Pending = {
	channel: "driver" | "rpc";
	expected: DriverMessage | RpcMessage;
	timer: ReturnType<typeof setTimeout>;
	resolve: (reply: Header) => void;
	reject: (error: Error) => void;
};

type ClientOptions = {
	onState?: (state: SolarXRState) => void;
	onMessage?: (message: Header) => void;
	reconnectDelayMs?: number;
	requestTimeoutMs?: number;
};

export class SolarXRClient {
	#socket?: WebSocket;
	#reconnectTimer?: ReturnType<typeof setTimeout>;
	#connectTimer?: ReturnType<typeof setTimeout>;
	#state: SolarXRState = { status: "stopped" };
	#nextId = 1;
	#handshakeAttempt = 0;
	#pending = new Map<number, Pending>();

	constructor(
		private readonly url: string,
		private readonly options: ClientOptions = {},
	) {}

	get state(): SolarXRState {
		return this.#state;
	}

	start(): void {
		if (this.#state.status === "stopped") this.#connect();
	}

	stop(): void {
		clearTimeout(this.#reconnectTimer);
		this.#reconnectTimer = undefined;
		this.#dropSocket("SolarXR client stopped");
		this.#setState({ status: "stopped" });
	}

	sendDriver(type: DriverMessage, message: NonNullable<DriverMessageHeaderT["message"]>): void {
		this.#requireReady();
		this.#send(new DriverMessageHeaderT(null, null, type, message));
	}

	sendRpc(type: RpcMessage, message: NonNullable<RpcMessageHeaderT["message"]>): void {
		this.#requireReady();
		this.#send(new RpcMessageHeaderT(null, null, type, message));
	}

	async requestDriver(
		type: DriverMessage,
		message: NonNullable<DriverMessageHeaderT["message"]>,
		expected: DriverMessage,
	): Promise<DriverMessageHeaderT> {
		this.#requireReady();
		return this.#request(new DriverMessageHeaderT(null, null, type, message), expected);
	}

	async requestRpc(
		type: RpcMessage,
		message: NonNullable<RpcMessageHeaderT["message"]>,
		expected: RpcMessage,
	): Promise<RpcMessageHeaderT> {
		this.#requireReady();
		return this.#request(new RpcMessageHeaderT(null, null, type, message), expected);
	}

	#getTimeout(): number {
		return this.options.requestTimeoutMs ?? 5000;
	}

	#setState(state: SolarXRState): void {
		if (state.status === "stopped" && this.#state.status === "stopped") return;

		this.#state = state;
		this.options.onState?.(state);
	}

	#connect(): void {
		const socket = new WebSocket(this.url);
		this.#socket = socket;
		socket.binaryType = "arraybuffer";

		this.#connectTimer = setTimeout(
			() => this.#disconnect(socket, "SolarXR connection timed out"),
			this.#getTimeout(),
		);

		socket.addEventListener("open", () => {
			if (socket !== this.#socket) return;
			clearTimeout(this.#connectTimer);
			this.#setState({ status: "waiting" });
		});
		socket.addEventListener("close", ({ code, reason }) => {
			this.#disconnect(socket, reason || `SolarXR connection closed (${code})`);
		});
		socket.addEventListener("error", (event) => {
			const reason = "message" in event && typeof event.message === "string" ? event.message : undefined;
			this.#disconnect(socket, reason || "SolarXR connection failed");
		});
		socket.addEventListener("message", ({ data }) => {
			if (socket !== this.#socket || !(data instanceof ArrayBuffer)) return;
			let bundle: MessageBundleT;
			try {
				bundle = decodeSolarXRBundle(new Uint8Array(data)).unpack();
			} catch {
				this.#disconnect(socket, "Invalid SolarXR message bundle");
				return;
			}
			for (const header of [...bundle.driverMsgs, ...bundle.rpcMsgs]) {
				if (socket !== this.#socket) return;
				this.#receive(socket, header);
			}
		});

		this.#setState({ status: "connecting" });
	}

	#disconnect(socket: WebSocket, reason: string): void {
		if (socket !== this.#socket) return;

		this.#dropSocket(reason);
		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = undefined;
			this.#connect();
		}, this.options.reconnectDelayMs ?? 1000);

		this.#setState({ status: "disconnected", reason });
	}

	#dropSocket(reason: string): void {
		clearTimeout(this.#connectTimer);

		const socket = this.#socket;
		this.#socket = undefined;
		socket?.close();

		this.#rejectPending(reason);
	}

	#rejectPending(reason: string): void {
		for (const pending of this.#pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(new Error(reason));
		}

		this.#pending.clear();
	}

	#requireReady(): void {
		if (this.#state.status !== "ready") throw new Error("SolarXR driver is not ready");
	}

	#send(header: Header): void {
		const socket = this.#socket;
		if (socket?.readyState !== WebSocket.OPEN) throw new Error("SolarXR socket is not open");
		if (socket.bufferedAmount >= MAX_BUFFERED_BYTES) throw new Error("SolarXR send buffer is full");

		const bundle = new MessageBundleT();
		if (header instanceof DriverMessageHeaderT) bundle.driverMsgs.push(header);
		else bundle.rpcMsgs.push(header);

		socket.send(encodeSolarXRBundle(bundle));
	}

	#request<T extends Header>(header: T, expected: T["messageType"]): Promise<T> {
		let id: number;
		do {
			id = this.#nextId;
			this.#nextId = id === 0xffffffff ? 1 : id + 1;
		} while (this.#pending.has(id));

		header.txId = id;

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.#pending.delete(id);
				reject(new Error(`SolarXR request ${id} timed out`));
			}, this.#getTimeout());

			this.#pending.set(id, {
				channel: header instanceof DriverMessageHeaderT ? "driver" : "rpc",
				expected,
				timer,
				resolve: (reply) => resolve(reply as T),
				reject,
			});

			try {
				this.#send(header);
			} catch (err) {
				clearTimeout(timer);
				this.#pending.delete(id);
				reject(err);
			}
		});
	}

	#receive(socket: WebSocket, header: Header): void {
		const isDriver = header instanceof DriverMessageHeaderT;

		if (header.replyTo !== null) {
			const pending = this.#pending.get(header.replyTo);
			if (
				!pending ||
				pending.channel !== (isDriver ? "driver" : "rpc") ||
				pending.expected !== header.messageType ||
				!header.message
			)
				return;

			clearTimeout(pending.timer);
			this.#pending.delete(header.replyTo);
			pending.resolve(header);

			return;
		}
		if (isDriver && header.messageType === DriverMessage.HandshakeAvailable) {
			if (this.#state.status === "waiting" || this.#state.status === "rejected") void this.#handshake(socket);
			return;
		}
		if (
			isDriver &&
			header.messageType === DriverMessage.HandshakeResponse &&
			header.message instanceof HandshakeResponseT
		) {
			if (header.message.status === HandshakeStatus.REJECTED_DISABLED) {
				this.#handshakeAttempt++;
				this.#rejectPending("SolarXR driver was disabled");
				this.#setState({ status: "rejected", reason: header.message.status });
			}

			return;
		}
		if (this.#state.status === "ready") this.options.onMessage?.(header);
	}

	async #handshake(socket: WebSocket): Promise<void> {
		const attempt = ++this.#handshakeAttempt;
		this.#setState({ status: "handshaking" });
		if (socket !== this.#socket) return;

		try {
			const { message } = await this.#request(
				new DriverMessageHeaderT(
					null,
					null,
					DriverMessage.HandshakeRequest,
					new HandshakeRequestT("SlimeTora"),
				),
				DriverMessage.HandshakeResponse,
			);
			if (
				socket !== this.#socket ||
				attempt !== this.#handshakeAttempt ||
				!(message instanceof HandshakeResponseT)
			)
				return;

			const { status } = message;
			this.#setState(
				status === HandshakeStatus.ACCEPTED ? { status: "ready" } : { status: "rejected", reason: status },
			);
		} catch (err) {
			if (attempt === this.#handshakeAttempt) this.#disconnect(socket, String(err));
		}
	}
}
