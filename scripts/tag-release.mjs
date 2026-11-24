import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

try {
	if (git("diff", "--cached", "--name-only"))
		throw new Error("Commit or unstage your staged changes before tagging.");

	const { version } = JSON.parse(git("show", "HEAD:package.json"));
	const semver =
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
	const match = typeof version === "string" ? semver.exec(version) : null;
	if (!match || match[4]?.split(".").some((part) => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0")))
		throw new Error("package.json must contain a valid semantic version.");

	const tag = `v${version}`;
	if (git("tag", "--list", tag)) throw new Error(`Tag ${tag} already exists.`);

	execFileSync("git", ["tag", "-m", `Release ${tag}`, tag, "HEAD"], { cwd: root, stdio: "inherit" });

	console.log(`Created ${tag} at ${git("rev-parse", "--short=8", "HEAD")}.`);
	console.log(`Push the current branch and tag together: git push --atomic origin HEAD refs/tags/${tag}`);
} catch (error) {
	console.error(`Could not tag release: ${error instanceof Error ? error.message : String(error)}`);
	process.exitCode = 1;
}
