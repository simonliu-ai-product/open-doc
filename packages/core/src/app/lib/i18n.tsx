import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ZH_TW } from './i18n-zh-tw';

/**
 * The viewer chrome in English or Traditional Chinese. The English text is the
 * key, so a string with no translation yet still reads — in English — instead
 * of showing a key. Only the chrome is translated: what prints on the page is
 * the document's, and `meta.labels` already decides what a figure is called.
 */
export const LOCALES = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
] as const;
export type Locale = (typeof LOCALES)[number]['value'];

const STORAGE = 'open-doc:locale';
const DICTIONARIES: Record<Locale, Record<string, string>> = { en: {}, 'zh-TW': ZH_TW };

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE);
    if (stored === 'en' || stored === 'zh-TW') return stored;
  } catch {}
  if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language)) return 'zh-TW';
  return 'en';
}

export type Translate = (text: string, vars?: Record<string, string | number>) => string;

function translate(locale: Locale, text: string, vars?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale][text] ?? text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

type LocaleState = { locale: Locale; setLocale: (locale: Locale) => void; t: Translate };

const LocaleContext = createContext<LocaleState>({
  locale: 'en',
  setLocale: () => {},
  t: (text, vars) => translate('en', text, vars),
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE, next);
    } catch {}
  }, []);

  // `t` keeps one identity for the app's lifetime and reads the locale when
  // called. Components still re-render on a switch — the context value changes —
  // but an effect that lists `t` does not re-run, so switching language never
  // tears down an edit in progress or refetches what the inspector holds.
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const t = useCallback<Translate>((text, vars) => translate(localeRef.current, text, vars), []);
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  return useContext(LocaleContext);
}

export function useT(): Translate {
  return useContext(LocaleContext).t;
}
