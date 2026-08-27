import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { say, type Language, type Phrase } from '@backhaul/domain';

/**
 * The driver's language, for the whole driver face.
 *
 * It was state inside `DriverScreen` first, which meant a driver who chose
 * Hausa saw Hausa on that one screen and English the moment they opened the
 * checkpoint ledger — the app agreeing to speak their language and then not
 * doing it. A language is a property of the person, not of a screen.
 *
 * Persisted, like the theme: a driver sets this once, on a phone they may have
 * bought second-hand with somebody else's locale still on it.
 */
const STORAGE_KEY = 'backhaul.language.v1';

const DEFAULT: Language = 'en';

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'ha';
}

interface Chosen {
  readonly language: Language;
  readonly setLanguage: (next: Language) => void;
  /** `say(language, phrase)`, with the language already applied. */
  readonly t: (phrase: Phrase) => string;
}

const LanguageContext = createContext<Chosen>({
  language: DEFAULT,
  setLanguage: () => {},
  t: (phrase) => say(DEFAULT, phrase),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(DEFAULT);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isLanguage(stored)) setLanguage(stored);
      } catch {
        // Unreadable storage is not a reason to fail to start.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const change = useCallback((next: Language) => {
    setLanguage(next);
    // Fire and forget, as with the theme: the choice is already on screen.
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<Chosen>(
    () => ({
      language,
      setLanguage: change,
      t: (phrase: Phrase) => say(language, phrase),
    }),
    [language, change],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Chosen {
  return useContext(LanguageContext);
}
