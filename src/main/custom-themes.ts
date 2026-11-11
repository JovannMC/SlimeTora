import { app } from "electron";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CustomTheme } from "../shared/ipc/channels";

const exampleTheme = `/*
 * Custom SlimeTora theme example
 */
--body: #101820;
--panel: #1b2b36;
--card: #243b4a;
--text: #ffffff;
--text-alt: rgb(255 255 255 / 75%);

--button: var(--tertiary);
--primary: #2dd4bf;
--secondary: #38bdf8;
--secondary-alt: #a5f3fc;
--tertiary: #31505b;
--quaternary: #29414e;

--on-primary: #05201d;
--on-secondary: #06202a;
--on-tertiary: #ffffff;
--on-quaternary: #ffffff;
--on-button: #ffffff;

--slimetora-gradient: linear-gradient(180deg, #2dd4bf 0%, #38bdf8 100%);
--slimetora-gradient-alt: linear-gradient(180deg, rgb(45 212 191 / 28%), rgb(56 189 248 / 28%));
--brand-glow: linear-gradient(135deg, #2dd4bf 0%, #38bdf8 100%);
--status-glow: radial-gradient(ellipse 65% 120% at 0% 50%, #2dd4bf 0%, transparent 100%),
	radial-gradient(ellipse 75% 130% at 100% 0%, #38bdf8 0%, transparent 100%);

--font-heading: "Chakra Petch", sans-serif;
--font-body: system-ui, sans-serif;
`;

export async function getCustomThemes(): Promise<CustomTheme[]> {
	const directory = path.join(app.getPath("userData"), "themes");
	await mkdir(directory, { recursive: true });
	try {
		await writeFile(path.join(directory, "example.css"), exampleTheme, { flag: "wx" });
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
	}

	const entries = await readdir(directory, { withFileTypes: true });
	const files = entries
		.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".css"))
		.map((entry) => entry.name)
		.sort((left, right) => left.localeCompare(right));
	const usedIds = new Set<string>();
	const themes: CustomTheme[] = [];

	for (const filename of files) {
		const baseId = themeId(filename);
		let id = baseId;
		let suffix = 2;
		while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
		usedIds.add(id);
		themes.push({
			id,
			name: themeName(filename),
			css: await readFile(path.join(directory, filename), "utf8"),
		});
	}

	return themes;
}

function themeId(filename: string): string {
	const slug = path
		.parse(filename)
		.name.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return `custom-${slug || "theme"}`;
}

function themeName(filename: string): string {
	return path
		.parse(filename)
		.name.replace(/[-_]+/g, " ")
		.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
