// inspired by https://github.com/van100j/sveltekit-vite-electron-builder
import { app, BrowserWindow, net, protocol, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const APP_SCHEME = "app";
const APP_ORIGIN = `${APP_SCHEME}://bundle`;

// keep in sync with `--body` in app.css
const WINDOW_BACKGROUND = "#2c2d30";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const isDev = Boolean(devServerUrl);

const rendererRoot = path.join(app.getAppPath(), "dist/renderer");

export function registerAppScheme(): void {
    protocol.registerSchemesAsPrivileged([
        {
            scheme: APP_SCHEME,
            privileges: { standard: true, secure: true, supportFetchAPI: true },
        },
    ]);
}

function resolveRendererFile(pathname: string): string {
    const decoded = decodeURIComponent(pathname);
    const candidate = path.join(rendererRoot, decoded);

    const relative = path.relative(rendererRoot, candidate);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Refused to serve path outside renderer root: ${decoded}`);
    }

    return candidate;
}

export function serveRenderer(): void {
    protocol.handle(APP_SCHEME, async (request) => {
        const { pathname } = new URL(request.url);
        const requested = pathname === "/" ? "/index.html" : pathname;

        try {
            const filePath = resolveRendererFile(requested);

            try {
                await fs.access(filePath);
                return await serveFile(filePath);
            } catch {
                return await serveFile(resolveRendererFile("/index.html"));
            }
        } catch (error) {
            console.error(`[window] Failed to serve ${request.url}: ${error}`);
            return new Response("Not found", { status: 404 });
        }
    });
}

async function serveFile(filePath: string): Promise<Response> {
    return net.fetch(pathToFileURL(filePath).toString());
}

export function createMainWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1100,
        height: 780,
        minWidth: 800,
        minHeight: 600,
        show: false,
        backgroundColor: WINDOW_BACKGROUND,
        webPreferences: {
            preload: path.join(app.getAppPath(), "dist/preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    window.once("ready-to-show", () => window.show());

    window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        console.error(`[window] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    });

    if (isDev) {
        // mirror renderer console messages to main process
        window.webContents.on("console-message", (event) => {
            console.log(`[renderer:${event.level}] ${event.message}`);
        });
    }

    // open external links in default browser
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
    });

    window.webContents.on("will-navigate", (event, url) => {
        const allowedPrefix = isDev ? devServerUrl : APP_ORIGIN;
        if (allowedPrefix && url.startsWith(allowedPrefix)) return;

        event.preventDefault();
        if (url.startsWith("http://") || url.startsWith("https://")) void shell.openExternal(url);
    });

    if (isDev && devServerUrl) void window.loadURL(devServerUrl);
    else void window.loadURL(`${APP_ORIGIN}/`);

    return window;
}
