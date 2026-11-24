import * as esbuild from "esbuild";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let buildVersion = { version: "unknown", release: false };
try {
	const git = (...args) =>
		execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

	const commit = git("rev-parse", "--short=8", "HEAD");
	buildVersion = { version: commit, release: false };

	const dirty = Boolean(git("status", "--porcelain"));
	buildVersion.version += dirty ? "-dirty" : "";

	const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
	const tags = git("tag", "--points-at", "HEAD", "--list", `v${version}`).split("\n");

	buildVersion.release = !dirty && tags.includes(`v${version}`);
} catch {
	// treat as dev build if this fails
}

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
	define: { __BUILD_VERSION__: JSON.stringify(buildVersion) },
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
