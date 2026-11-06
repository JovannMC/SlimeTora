import { GITHUB_URL } from "./consts";

export type TranslationFile = Record<string, unknown>;
export type LanguageData = { bundled: Record<string, TranslationFile>; downloaded: Record<string, TranslationFile> };
export type AppUpdate = { version: string; url: string } | null;

const VERSION = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function compareVersions(a: string, b: string): number {
	const x = VERSION.exec(a);
	const y = VERSION.exec(b);

	if (!x || !y) throw new Error("Invalid version");

	for (let i = 1; i <= 3; i++) {
		const n = Number(x[i]) - Number(y[i]);
		if (n) return Math.sign(n);
	}

	if (!x[4] || !y[4]) return x[4] ? -1 : y[4] ? 1 : 0;
	const ap = x[4].split("."),
		bp = y[4].split(".");

	for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
		const l = ap[i],
			r = bp[i];
		if (l === undefined) return -1;
		if (r === undefined) return 1;
		if (l === r) continue;
		const ln = /^\d+$/.test(l),
			rn = /^\d+$/.test(r);
		if (ln && rn) return Math.sign(Number(l) - Number(r));
		if (ln !== rn) return ln ? -1 : 1;
		return l < r ? -1 : 1;
	}

	return 0;
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function validateTranslation(value: unknown, english: TranslationFile): TranslationFile {
	if (!object(value) || !object(value.meta) || typeof value.meta.language !== "string" || !value.meta.language)
		throw new Error("Invalid language metadata");

	const translators = Array.isArray(value.meta.translators)
		? value.meta.translators.filter(
				(translator: unknown) =>
					object(translator) && typeof translator.name === "string" && typeof translator.link === "string",
			)
		: undefined;
	const meta = { ...value.meta, ...(translators ? { translators } : {}) };

	function filter(source: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};

		for (const [key, v] of Object.entries(source)) {
			if (key === "meta") continue;
			if (!Object.hasOwn(base, key)) continue;

			const target = base[key];
			if (target === undefined) continue;

			if (typeof target === "string" && typeof v === "string") result[key] = v;
			else if (object(target) && object(v)) result[key] = filter(v, target);
		}

		return result;
	}

	return { meta, ...filter(value, english) };
}

export function findTranslation(data: LanguageData, locale: string, key: string): string | undefined {
	// the downloaded english file can be used to correct the bundled english file if needed, but the bundled english file is always the fallback for keys missing from the downloaded english file
	const layers =
		locale === "en-US"
			? [data.downloaded["en-US"], data.bundled["en-US"]]
			: [data.downloaded[locale], data.bundled[locale], data.downloaded["en-US"], data.bundled["en-US"]];

	for (const layer of layers) {
		const value = key.split(".").reduce<unknown>((current, part) => {
			if (!object(current)) return undefined;
			const match = Object.keys(current).find((k) => k.toLowerCase() === part.toLowerCase());
			return match === undefined ? undefined : current[match];
		}, layer);
		if (typeof value === "string") return value;
	}

	return undefined;
}

export function selectRelease(releases: unknown, channel: "stable" | "beta", current: string): AppUpdate {
	if (!Array.isArray(releases)) throw new Error("Invalid release response");

	let latest: AppUpdate = null;
	for (const release of releases) {
		if (
			!object(release) ||
			release.draft ||
			(channel === "stable" && release.prerelease) ||
			typeof release.tag_name !== "string" ||
			typeof release.html_url !== "string"
		)
			continue;

		try {
			const url = new URL(release.html_url);
			const repository = new URL(GITHUB_URL);
			if (url.origin !== repository.origin || !url.pathname.startsWith(`${repository.pathname}/releases/tag/`))
				continue;
			if (channel === "stable" && VERSION.exec(release.tag_name)?.[4]) continue;
			if (
				compareVersions(release.tag_name, current) > 0 &&
				(!latest || compareVersions(release.tag_name, latest.version) > 0)
			)
				latest = { version: release.tag_name.replace(/^v/, ""), url: url.href };
		} catch {
			// ignore malformed tags
		}
	}

	return latest;
}
