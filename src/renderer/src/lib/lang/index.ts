import { error, info, warn } from "#lib/log/index.js";
import { browser } from "$app/env";
import { derived, writable } from "svelte/store";

type Translations = Record<string, unknown>;
type TranslationParams = Record<string, string | number>;

const CURRENT_LOCALE_VERSION = 1;
const AVAILABLE_LOCALES = ["en-US", "ja-JP"];
const DEFAULT_LOCALE = "en-US";


export const locale = writable<string>(DEFAULT_LOCALE);
export const translations = writable<Record<string, Translations>>({});
export const loading = writable<boolean>(true);
export const initialized = writable<boolean>(false);
export const locales = writable<string[]>(AVAILABLE_LOCALES);
export const outdatedLocales = writable<string[]>([]);

export type TranslatorCredit = { name: string; link: string; pfp?: string };
export type Metadata = { version: string; language: string; translators?: TranslatorCredit[] };

export const translatorGroups = derived(translations, ($translations) =>
	Object.entries($translations).flatMap(([code, file]) => {
		const meta = file.meta as Metadata | undefined;
		if (!meta || !meta.translators) return [];
		const group = {
			language: `${meta.language} (${code})`,
			translators: meta?.translators || [],
		};
		return [group];
	}),
);

function lookup(obj: unknown, path: string): unknown {
	return path.split(".").reduce<unknown>((current, part) => {
		if (!current || typeof current !== "object") return undefined;
		const key = Object.keys(current).find((k) => k.toLowerCase() === part.toLowerCase());
		return key === undefined ? undefined : (current as Record<string, unknown>)[key];
	}, obj);
}

function replaceVariables(text: string, params: TranslationParams): string {
	return text.replace(/\{\{(\w+)\}\}/g, (match, key) => params[key]?.toString() || match);
}

export const t = derived([translations, locale], ([$translations, $locale]) => {
	return (key: string, params: TranslationParams = {}): string => {
		const localeTranslations = $translations[$locale];
		if (!localeTranslations) {
			console.warn(`No translations found for locale: ${$locale}`);
			return key;
		}

		const value = lookup(localeTranslations, key);
		if (typeof value === "string") return replaceVariables(value, params);

		// fall back to the default locale
		if ($locale !== DEFAULT_LOCALE) {
			const fallback = lookup($translations[DEFAULT_LOCALE], key);
			if (typeof fallback === "string") return replaceVariables(fallback, params);
		}

		console.warn(`Translation not found for key: ${key}`);
		return key;
	};
});

function checkLocaleVersion(code: string, file: Translations) {
	const version = Number((file.meta as Metadata | undefined)?.version);
	if (!Number.isFinite(version)) {
		warn(`Translation file ${code} has no valid meta.version`);
		outdatedLocales.update((list) => [...list, code]);
	} else if (version < CURRENT_LOCALE_VERSION) {
		warn(`Translation file ${code} is out of date (version ${version}, expected ${CURRENT_LOCALE_VERSION})`);
		outdatedLocales.update((list) => [...list, code]);
	}
}

async function loadLocaleTranslations(targetLocale: string): Promise<Translations | null> {
	if (!browser) return null;

	const filePath = `/langs/${targetLocale}.json`;
	try {
		const response = await fetch(filePath);
		if (!response.ok) {
			error(`Translation file not found: ${filePath}`);
			return null;
		}

		const parsed = await response.json();
		checkLocaleVersion(targetLocale, parsed);
		info(`Loaded translations for locale: ${targetLocale}`);
		return parsed;
	} catch (err: any) {
		error(`Error loading translations for ${targetLocale}: ${err.message || err}`);
		return null;
	}
}

export async function initTranslations(initialLocale: string = DEFAULT_LOCALE): Promise<void> {
	if (!browser) return;

	loading.set(true);

	try {
		const allTranslations: Record<string, Translations> = {};
		for (const loc of AVAILABLE_LOCALES) {
			const localeTranslations = await loadLocaleTranslations(loc);
			if (localeTranslations) allTranslations[loc] = localeTranslations;
		}

		translations.set(allTranslations);
		locale.set(AVAILABLE_LOCALES.includes(initialLocale) ? initialLocale : DEFAULT_LOCALE);

		initialized.set(true);
		info(`Translations initialized. Available locales: ${Object.keys(allTranslations).join(", ")}`);
	} catch (err: any) {
		error(`Failed to initialize translations: ${err.message || err}`);
	} finally {
		loading.set(false);
	}
}

export function changeLocale(newLocale: string): void {
	if (!AVAILABLE_LOCALES.includes(newLocale)) {
		error(`Unsupported locale: ${newLocale}. Available locales: ${AVAILABLE_LOCALES.join(", ")}`);
		return;
	}

	locale.set(newLocale);
	info(`Locale changed to: ${newLocale}`);
}
