import assert from 'node:assert/strict';
import test from 'node:test';
import { LANGUAGE_STORAGE_KEY, LANGUAGES, normalizeLanguageCode, resolveLanguage, setLanguage, t, TRANSLATIONS } from '../src/i18n.ts';

test('every line has text in every language', () => {
  for (const [key, lines] of Object.entries(TRANSLATIONS)) {
    for (const language of LANGUAGES) {
      const line = (lines as Record<string, string>)[language];
      assert.equal(typeof line, 'string', `${key} is missing ${language}`);
      assert.notEqual(line!.length, 0, `${key} has empty ${language}`);
    }
  }
});

test('a translation keeps the slots of its English, in the same order', () => {
  const slots = (line: string): string[] => line.match(/%[sd]/g) ?? [];
  for (const [key, lines] of Object.entries(TRANSLATIONS)) {
    for (const language of LANGUAGES) {
      assert.deepEqual(slots((lines as Record<string, string>)[language]!), slots(key), `${key} changes its slots in ${language}`);
    }
  }
});

test('normalizes regional and oddly cased codes to a language the game speaks', () => {
  assert.equal(normalizeLanguageCode('ru-RU'), 'ru');
  assert.equal(normalizeLanguageCode('EN_us'), 'en');
  assert.equal(normalizeLanguageCode(' ru '), 'ru');
  assert.equal(normalizeLanguageCode('fr-FR'), null);
  assert.equal(normalizeLanguageCode(''), null);
  assert.equal(normalizeLanguageCode(undefined), null);
  assert.equal(normalizeLanguageCode(42), null);
});

test('the platform, then the URL, then what was saved, then the browser decide the language', () => {
  // Yandex says Russian: it wins over everything.
  assert.equal(resolveLanguage({ platform: 'ru', search: '?lang=en', stored: 'en', browser: ['en-US'] }), 'ru');
  // The URL beats what was saved and the browser.
  assert.equal(resolveLanguage({ search: '?lang=ru-RU', stored: 'en', browser: ['en-US'] }), 'ru');
  // What was saved beats the browser.
  assert.equal(resolveLanguage({ search: '', stored: 'ru', browser: ['en-US'] }), 'ru');
  // The browser's list, in its own order.
  assert.equal(resolveLanguage({ search: '', stored: null, browser: ['fr-FR', 'ru-RU', 'en'] }), 'ru');
  assert.equal(resolveLanguage({ browser: ['en-GB', 'ru'] }), 'en');
});

test('a language the game does not speak is passed over rather than stopping the search', () => {
  // A Turkish Yandex interface in a Russian browser gets Russian, not English.
  assert.equal(resolveLanguage({ platform: 'tr', search: '', stored: null, browser: ['ru-RU'] }), 'ru');
  assert.equal(resolveLanguage({ platform: null, search: '?lang=fr', stored: 'de', browser: ['fr-FR'] }), 'en');
  assert.equal(resolveLanguage({ browser: ['fr-FR'], fallback: 'ru' }), 'ru');
  assert.equal(resolveLanguage({ browser: [], fallback: 'xx' }), 'en');
  assert.equal(resolveLanguage(), 'en');
});

test('the stored language lives under a stable key', () => {
  assert.equal(LANGUAGE_STORAGE_KEY, 'language');
});

test('t fills the slots in order, rounds %d, and speaks the chosen language', () => {
  setLanguage('en');
  assert.equal(t('Score: %d', 12), 'Score: 12');
  assert.equal(t('Score: %d', 12.6), 'Score: 13');
  assert.equal(t('Play'), 'Play');

  setLanguage('ru');
  assert.equal(t('Score: %d', 12), 'Счёт: 12');
  assert.equal(t('Play'), 'Играть');

  setLanguage('en');
});

test('a value that looks like a slot does not swallow the next one, and a slot with no value stays', () => {
  setLanguage('en');
  assert.equal(t('Score: %d'), 'Score: %d');
  assert.equal(t('Score: %d', '%d'), 'Score: %d');
  assert.equal(t('Score: %d', '$&'), 'Score: $&');
});
