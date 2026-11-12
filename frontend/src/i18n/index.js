/**
 * Translation core, usable outside React (error/date helpers) as well as
 * through LanguageContext. Each language lives in its own file with the same
 * keys as en.js; src/i18n/__tests__ fails if a key is missing anywhere.
 *
 *   translate('sos_submitted')                       → "SOS submitted…"
 *   translate('notif_unread_count', { count: 3 })    → "3 unread"
 */
import en from './en';
import hi from './hi';
import mr from './mr';
import te from './te';
import ta from './ta';
import kn from './kn';

export const TRANSLATIONS = { en, hi, mr, te, ta, kn };

export const LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English', locale: 'en-IN' },
  { code: 'hi', label: 'Hindi',   nativeLabel: 'हिंदी',     locale: 'hi-IN' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी',     locale: 'mr-IN' },
  { code: 'te', label: 'Telugu',  nativeLabel: 'తెలుగు',    locale: 'te-IN' },
  { code: 'ta', label: 'Tamil',   nativeLabel: 'தமிழ்',     locale: 'ta-IN' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ',     locale: 'kn-IN' },
];

const STORAGE_KEY = 'app_language';
const warned = new Set();

function initialLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && TRANSLATIONS[stored]) return stored;
  } catch {
    // storage unavailable (private mode, tests): fall back to English
  }
  return 'en';
}

let current = initialLanguage();

export const getLanguage = () => current;

export const getLocale = () => (LANGUAGES.find((l) => l.code === current) || LANGUAGES[0]).locale;

export function setCurrentLanguage(code) {
  if (!TRANSLATIONS[code]) return;
  current = code;
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // ignore: the choice still applies for this session
  }
}

function warnMissing(lang, key) {
  const id = `${lang}:${key}`;
  if (process.env.NODE_ENV !== 'production' && !warned.has(id)) {
    warned.add(id);
    console.warn(`[i18n] Missing translation "${key}" for "${lang}"`);
  }
}

export function translate(key, vars) {
  let text = TRANSLATIONS[current]?.[key];
  if (text === undefined) {
    if (current !== 'en') warnMissing(current, key);
    text = en[key];
  }
  if (text === undefined) {
    warnMissing('en', key);
    return key;
  }
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, name) => (vars[name] !== undefined ? String(vars[name]) : match));
  }
  return text;
}
