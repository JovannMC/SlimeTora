// inspired by https://github.com/chinni-03/electron-sveltekit-template/blob/main/scripts/dev-electron.js
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import waitOn from "wait-on";
import { mainBuildOptions, preloadBuildOptions } from "./esbuild.config.mjs";

const require = createRequire(import.meta.url);
const electronBinary = require("electron");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

let electronProcess;
let shuttingDown = false;
let allowRestart = false;

function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;

    if (electronProcess && !electronProcess.killed) electronProcess.kill("SIGTERM");
    process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

function startElectron() {
    const child = spawn(electronBinary, ["."], {
        stdio: "inherit",
        env: {
            ...process.env,
            NODE_ENV: "development",
            VITE_DEV_SERVER_URL: DEV_SERVER_URL,
        },
    });

    electronProcess = child;

    child.on("exit", (code, signal) => {
        if (electronProcess !== child || shuttingDown) return;

        if (signal) console.error(`[dev] Electron exited from signal ${signal}`);
        shutdown(code ?? 0);
    });

    child.on("error", (error) => {
        console.error(`[dev] Failed to spawn Electron: ${error.message}`);
    });
}

let restartTimer;

function scheduleRestart() {
    if (!allowRestart || !electronProcess || shuttingDown) return;

    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
        electronProcess.kill("SIGTERM");
        startElectron();
    }, 50);
}

const restartPlugin = {
    name: "restart-electron",
    setup(build) {
        build.onEnd((result) => {
            if (result.errors.length > 0) return;
            scheduleRestart();
        });
    },
};

try {
    await waitOn({ resources: [DEV_SERVER_URL], timeout: 30000 });

    const mainContext = await esbuild.context({ ...mainBuildOptions, plugins: [restartPlugin] });
    const preloadContext = await esbuild.context({ ...preloadBuildOptions, plugins: [restartPlugin] });

    await Promise.all([mainContext.rebuild(), preloadContext.rebuild()]);
    await Promise.all([mainContext.watch(), preloadContext.watch()]);
} catch (error) {
    console.error(`[dev] ${error instanceof Error ? error.message : error}`);
    shutdown(1);
}

startElectron();
allowRestart = true;
