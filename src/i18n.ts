/**
 * What language the game speaks, and every line it says.
 *
 * TEMPLATE: `TRANSLATIONS` is the game's own; everything else here is the machinery and can be
 * left alone. Add a language by putting its code in `LANGUAGES` and a column in every entry —
 * a missing one is a compile error rather than a blank label at runtime.
 */

/** Every language the game speaks. The first is the one it falls back to. */
export const LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Where a chosen language is kept between visits, in localStorage. The hook for a language setting. */
export const LANGUAGE_STORAGE_KEY = 'language';

/**
 * Every line the player can read, in each language, keyed by its English. The key is the English
 * itself, so a call site reads as plain English and a line without a translation is a compile
 * error. `%s` takes a value as it is and `%d` a number rounded to a whole one, in the order they
 * are handed to `t`.
 */
export const TRANSLATIONS = {
  Play: { en: 'Play', ru: 'Играть' },
  Pause: { en: 'Pause', ru: 'Пауза' },
  'Score: %d': { en: 'Score: %d', ru: 'Счёт: %d' },
  'Tap to start': { en: 'Tap to start', ru: 'Нажмите, чтобы начать' },
} satisfies Record<string, Record<Language, string>>;

export type TranslationKey = keyof typeof TRANSLATIONS;

let current: Language = LANGUAGES[0];

/** The language the game is showing. */
export function getLanguage(): Language {
  return current;
}

/** Show the game in a language. Text already made keeps its wording, so this goes before anything is drawn. */
export function setLanguage(language: Language): void {
  current = language;
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}

/** A code such as "ru", "ru-RU" or "EN_us" as one of the game's languages, or null when the game does not speak it. */
export function normalizeLanguageCode(code: unknown): Language | null {
  if (typeof code !== 'string') return null;
  const base = code.trim().toLowerCase().replace(/_/g, '-').split('-')[0] ?? '';
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : null;
}

/** Everywhere a language can come from. Each is optional and may name a language the game does not speak. */
export interface LanguageSources {
  /**
   * What the platform is showing the game in. Yandex Games hands over its interface language and
   * expects the game to follow it, so this beats everything else.
   */
  platform?: string | null;
  /** The page's query string: `?lang=ru` is the way to try a language out. */
  search?: string | null;
  /** What the player chose last time, from LANGUAGE_STORAGE_KEY. */
  stored?: string | null;
  /** The browser's languages, the most preferred first. */
  browser?: readonly string[];
  fallback?: string;
}

/**
 * Settle on a language from wherever one is on offer, the most authoritative first: the platform,
 * then `?lang=` on the URL, then what was saved, then the browser's own list. Anything the game
 * does not speak is passed over, so a Turkish interface in a Russian browser gets Russian rather
 * than English, and only when nothing fits does it fall back.
 */
export function resolveLanguage({ platform, search, stored, browser = [], fallback = LANGUAGES[0] }: LanguageSources = {}): Language {
  const query = new URLSearchParams(search ?? '').get('lang');
  for (const candidate of [platform, query, stored, ...browser]) {
    const language = normalizeLanguageCode(candidate);
    if (language) return language;
  }
  return normalizeLanguageCode(fallback) ?? LANGUAGES[0];
}

/**
 * Everything the game can be told about a language, gathered from the page and the platform. Kept
 * apart from `resolveLanguage` so the rule can be tested without a browser.
 */
export function detectLanguage(platformLanguage: string | null, stored: string | null): Language {
  return resolveLanguage({
    platform: platformLanguage,
    search: typeof location === 'undefined' ? null : location.search,
    stored,
    browser: typeof navigator === 'undefined' ? [] : [...navigator.languages, navigator.language],
  });
}

/**
 * A line in the current language, with its `%s` and `%d` slots filled from `values` in order.
 * `%d` rounds to a whole number, so a stat that arrives as a float does not come out with a tail
 * of decimals. A slot with no value keeps its marker, and a value is put in as it is, so one that
 * happens to contain `%s` does not swallow the next.
 */
export function t(key: TranslationKey, ...values: (string | number)[]): string {
  let i = 0;
  return TRANSLATIONS[key][current].replace(/%[sd]/g, (slot) => {
    if (i >= values.length) return slot;
    const value = values[i++];
    return slot === '%d' && typeof value === 'number' ? String(Math.round(value)) : String(value);
  });
}
