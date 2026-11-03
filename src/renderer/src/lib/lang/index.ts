import { getBridge } from "#lib/api/bridge";
import { error, info, warn } from "#lib/log/index";
import { program } from "#lib/store/settings";
import { browser } from "$app/env";
import { findTranslation, type LanguageData, type TranslationFile } from "$shared/updates";
import { derived, get, writable } from "svelte/store";

type TranslationParams = Record<string, string | number>;

const DEFAULT_LOCALE = "en-US";

export const locale = writable<string>(DEFAULT_LOCALE);
export const translations = writable<Record<string, TranslationFile>>({});
export const loading = writable<boolean>(true);
export const initialized = writable<boolean>(false);
export const locales = writable<string[]>([]);
export const outdatedLocales = writable<string[]>([]);
const languageData = writable<LanguageData>({ bundled: {}, downloaded: {} });
export type TranslatorCredit = { name: string; link: string; pfp?: string };
export type Metadata = { version: string; language: string; translators?: TranslatorCredit[] };

export const translatorGroups = derived(translations, ($translations) =>
	Object.entries($translations).flatMap(([code, file]) => {
		const meta = file.meta as Metadata | undefined;
		return meta?.translators ? [{ language: `${meta.language} (${code})`, translators: meta.translators }] : [];
	}),
);

export const t = derived(
	[languageData, locale, loading],
	([$data, $locale, $loading]) =>
		(key: string, params: TranslationParams = {}): string => {
			const value = findTranslation($data, $locale, key);
			if (value !== undefined)
				return value.replace(/\{\{(\w+)\}\}/g, (match, name: string) => params[name]?.toString() ?? match);
			if (!$loading) warn(["lang"], `Translation not found for key: ${key}`);
			return key;
		},
);

export async function refreshTranslations(): Promise<void> {
	const data = await getBridge().getLanguages();

	languageData.set(data);
	translations.set({ ...data.bundled, ...data.downloaded });
	locales.set([...new Set([...Object.keys(data.bundled), ...Object.keys(data.downloaded)])].sort());
}

export async function initTranslations(initialLocale: string = DEFAULT_LOCALE): Promise<void> {
	if (!browser) return;

	loading.set(true);
	try {
		await refreshTranslations();

		locale.set(get(locales).includes(initialLocale) ? initialLocale : DEFAULT_LOCALE);
		initialized.set(true);
		info(["lang"], `Translations initialized: ${get(locales).join(", ")}`);
	} catch (err) {
		error(["lang"], `Failed to initialize translations: ${String(err)}`);
	} finally {
		loading.set(false);
	}
}

export function changeLocale(newLocale: string): void {
	if (!get(locales).includes(newLocale)) {
		error(["lang"], `Unsupported locale: ${newLocale}`);
		return;
	}

	program.update((settings) => ({ ...settings, locale: newLocale }));
	locale.set(newLocale);
}
