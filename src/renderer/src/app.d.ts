declare global {
    interface Window {
        slimetora?: import("$shared/ipc/channels").PlatformBridge;
    }
}

export {};
