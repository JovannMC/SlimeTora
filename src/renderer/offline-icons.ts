import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type { Plugin } from "vite";

const virtualId = "virtual:slimetora-icons";
const resolvedId = `\0${virtualId}`;
const require = createRequire(import.meta.url);
const sourceExtensions = new Set([".svelte", ".ts", ".js", ".json", ".html"]);

type IconCollection = {
	prefix: string;
	width?: number;
	height?: number;
	icons: Record<string, unknown>;
	aliases?: Record<string, { parent: string }>;
};

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) return sourceFiles(file);

		return entry.isFile() && sourceExtensions.has(path.extname(entry.name)) ? [file] : [];
	});
}

function findIcons(root: string): string[] {
	const icons = new Set<string>();
	for (const directory of ["src", "static"]) {
		for (const file of sourceFiles(path.join(root, directory))) {
			for (const match of readFileSync(file, "utf8").matchAll(/\b(?:mdi|ri):[a-z0-9-]+/g)) icons.add(match[0]);
		}
	}
	return [...icons].sort();
}

function iconSubset(prefix: string, names: string[]): IconCollection {
	const file = require.resolve(`@iconify-json/${prefix}/icons.json`);
	const source = JSON.parse(readFileSync(file, "utf8")) as IconCollection;
	const icons: IconCollection["icons"] = {};
	const aliases: NonNullable<IconCollection["aliases"]> = {};

	function include(name: string): void {
		if (Object.hasOwn(icons, name) || Object.hasOwn(aliases, name)) return;
		if (Object.hasOwn(source.icons, name)) {
			icons[name] = source.icons[name];
			return;
		}

		const alias = source.aliases?.[name];
		if (!alias) throw new Error(`Unknown offline icon: ${prefix}:${name}`);

		aliases[name] = alias;
		include(alias.parent);
	}

	for (const name of names) include(name);
	return { prefix, width: source.width, height: source.height, icons, aliases };
}

export function offlineIcons(root: string): Plugin {
	let previousNames = "";
	return {
		name: "slimetora-offline-icons",
		resolveId(id) {
			if (id === virtualId) return resolvedId;
		},
		load(id) {
			if (id !== resolvedId) return;

			const names = findIcons(root);
			previousNames = names.join(",");

			const collections = ["mdi", "ri"].map((prefix) =>
				iconSubset(
					prefix,
					names.filter((name) => name.startsWith(`${prefix}:`)).map((name) => name.slice(prefix.length + 1)),
				),
			);

			return `import { addCollection } from "@iconify/svelte";\n${collections
				.map((collection) => `addCollection(${JSON.stringify(collection)});`)
				.join("\n")}`;
		},
		configureServer(server) {
			const roots = ["src", "static"].map((directory) => `${path.join(root, directory).replaceAll("\\", "/")}/`);

			server.watcher.on("all", (_event, file) => {
				if (!roots.some((directory) => file.replaceAll("\\", "/").startsWith(directory))) return;
				if (!sourceExtensions.has(path.extname(file))) return;

				const names = findIcons(root).join(",");
				if (names === previousNames) return;

				previousNames = names;

				const module = server.moduleGraph.getModuleById(resolvedId);
				if (module) server.moduleGraph.invalidateModule(module);

				server.ws.send({ type: "full-reload" });
			});
		},
	};
}
