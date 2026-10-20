import * as esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const shared = {
    bundle: true,
    platform: "node",
    target: "node24",
    sourcemap: true,
    logLevel: "info",
    packages: "external",
    external: ["electron"],
    alias: {
        $shared: path.join(root, "src/shared"),
    },
};

/** @type {import('esbuild').BuildOptions} */
export const mainBuildOptions = {
    ...shared,
    entryPoints: [path.join(root, "src/main/index.ts")],
    outfile: path.join(root, "dist/main/index.js"),
    format: "esm",
};

/** @type {import('esbuild').BuildOptions} */
export const preloadBuildOptions = {
    ...shared,
    entryPoints: [path.join(root, "src/preload/index.ts")],
    outfile: path.join(root, "dist/preload/index.cjs"),
    format: "cjs",
};

export async function buildNode() {
    await Promise.all([esbuild.build(mainBuildOptions), esbuild.build(preloadBuildOptions)]);
}
