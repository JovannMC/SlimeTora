import { app, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { GITHUB_API_URL, GITHUB_DEFAULT_BRANCH, GITHUB_RAW_URL, GITHUB_URL } from "../shared/consts";
import {
	selectRelease,
	validateTranslation,
	type AppUpdate,
	type LanguageData,
	type TranslationFile,
} from "../shared/updates";

const LANGUAGE_DIRECTORY = `${GITHUB_API_URL}/contents/updates/languages?ref=${GITHUB_DEFAULT_BRANCH}`;
const LANGUAGE_FILES = `${GITHUB_RAW_URL}/${GITHUB_DEFAULT_BRANCH}/updates/languages/`;
const RELEASES = `${GITHUB_API_URL}/releases?per_page=100`;
const cacheDir = () => path.join(app.getPath("userData"), "languages");
const bundledDir = () =>
	process.env.VITE_DEV_SERVER_URL
		? path.join(app.getAppPath(), "src/renderer/static/langs")
		: path.join(app.getAppPath(), "dist/renderer/langs");

async function fetchBytes(url: string, max: number): Promise<Buffer> {
	const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "SlimeTora" } });

	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	const length = Number(response.headers.get("content-length"));
	if (length > max) throw new Error("Response too large");

	if (!response.body) throw new Error("Empty response");
	const chunks: Uint8Array[] = [];
	let size = 0;

	for await (const chunk of response.body) {
		size += chunk.length;
		if (size > max) throw new Error("Response too large");
		chunks.push(chunk);
	}
	return Buffer.concat(chunks);
}

async function bundled(): Promise<Record<string, TranslationFile>> {
	const result: Record<string, TranslationFile> = {};

	for (const name of await fs.readdir(bundledDir())) {
		if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*\.json$/.test(name)) continue;
		try {
			result[name.slice(0, -5)] = JSON.parse(
				await fs.readFile(path.join(bundledDir(), name), "utf8"),
			) as TranslationFile;
		} catch {
			// skip malformed bundled files
		}
	}

	if (!result["en-US"]) throw new Error("Bundled English is unavailable");
	return result;
}

async function readCached(locale: string, english: TranslationFile): Promise<TranslationFile | undefined> {
	try {
		const raw = await fs.readFile(path.join(cacheDir(), `${locale}.json`), "utf8");
		const saved = JSON.parse(raw) as unknown;
		const cachedData =
			saved && typeof saved === "object" && "entry" in saved && "data" in saved ? saved.data : saved;

		return validateTranslation(cachedData, english);
	} catch {
		return;
	}
}

export async function getLanguages(): Promise<LanguageData> {
	const base = await bundled();
	const downloaded: Record<string, TranslationFile> = {};

	let names: string[] = [];
	try {
		names = await fs.readdir(cacheDir());
	} catch {
		// no cache yet
	}

	for (const name of names) {
		if (!/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*\.json$/.test(name)) continue;
		const locale = name.slice(0, -5);
		const saved = await readCached(locale, base["en-US"]!);
		if (saved) downloaded[locale] = saved;
	}
	return { bundled: base, downloaded };
}

export async function checkLanguages(): Promise<number> {
	const base = await bundled();

	const files = JSON.parse((await fetchBytes(LANGUAGE_DIRECTORY, 1_000_000)).toString()) as {
		name?: unknown;
		type?: unknown;
	}[];
	if (!Array.isArray(files)) throw new Error("Invalid language directory response");
	const locales = files
		.filter(
			(file) =>
				file.type === "file" &&
				typeof file.name === "string" &&
				/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*\.json$/.test(file.name),
		)
		.map((file) => (file.name as string).slice(0, -5));

	let updated = 0;
	const failures: string[] = [];

	for (const locale of locales) {
		const previous = await readCached(locale, base["en-US"]!);

		try {
			const bytes = await fetchBytes(`${LANGUAGE_FILES}${locale}.json`, 1_000_000);
			const data = validateTranslation(JSON.parse(bytes.toString()), base["en-US"]!);
			if (previous && JSON.stringify(previous) === JSON.stringify(data)) continue;

			await fs.mkdir(cacheDir(), { recursive: true });
			const dest = path.join(cacheDir(), `${locale}.json`);
			const temp = `${dest}.${process.pid}.tmp`;

			await fs.writeFile(temp, JSON.stringify(data));
			await fs.rename(temp, dest);

			updated++;
		} catch (err) {
			failures.push(`${locale}: ${String(err)}`);
		}
	}

	if (failures.length) throw new Error(failures.join("; "));
	return updated;
}

export async function checkApp(channel: "stable" | "beta"): Promise<AppUpdate> {
	const releases: unknown = JSON.parse((await fetchBytes(RELEASES, 1_000_000)).toString());

	return selectRelease(releases, channel, app.getVersion());
}

export async function openRelease(url: string): Promise<void> {
	const parsed = new URL(url);
	const repository = new URL(GITHUB_URL);

	if (parsed.origin !== repository.origin || !parsed.pathname.startsWith(`${repository.pathname}/releases/tag/`))
		throw new Error("Invalid release URL");

	await shell.openExternal(parsed.href);
}
