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
import { isLanguage, say, type Language, type Phrase } from '@backhaul/domain';

/**
 * The reader's language, for the whole app.
 *
 * It was state inside `DriverScreen` first, which meant somebody who chose
 * Hausa saw Hausa on that one screen and English the moment they opened
 * anything else — the app agreeing to speak their language and then not doing
 * it. A language is a property of the person, not of a screen.
 *
 * **Asked before anything else.** The first thing the app does, ahead of the
 * phone number, is ask which language to read in — because a sign-in screen in
 * the wrong language is the first thing a person cannot get past.
 *
 * Persisted, and read before the first render decides anything: `chosen` is
 * false until storage has answered, so nothing shows the wrong language for a
 * frame.
 */
const STORAGE_KEY = 'backhaul.language.v2';

/**
 * English until somebody says otherwise.
 *
 * Not the device locale. A phone bought second-hand carries the last owner's
 * choice, and guessing wrong on the very first screen is the one place it
 * costs somebody their ability to use the app at all.
 */
const DEFAULT: Language = 'en';

interface Chosen {
  readonly language: Language;
  readonly setLanguage: (next: Language) => void;
  /** `say(language, phrase)`, with the language already applied. */
  readonly t: (phrase: Phrase) => string;
  /**
   * Whether a person has actually picked, as opposed to getting the default.
   *
   * What the onboarding step keys off. Without it, somebody who deliberately
   * chose English would be asked again on every launch.
   */
  readonly chosen: boolean;
  /** False until storage has answered. */
  readonly ready: boolean;
}

const LanguageContext = createContext<Chosen>({
  language: DEFAULT,
  setLanguage: () => {},
  t: (phrase) => say(DEFAULT, phrase),
  chosen: false,
  ready: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(DEFAULT);
  const [chosen, setChosen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isLanguage(stored)) {
          setLanguage(stored);
          setChosen(true);
        }
      } catch {
        // Unreadable storage is not a reason to fail to start. It costs one
        // more tap at the language step, and nothing else.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const change = useCallback((next: Language) => {
    setLanguage(next);
    setChosen(true);
    // Fire and forget, as with the theme: the choice is already on screen.
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<Chosen>(
    () => ({
      language,
      setLanguage: change,
      t: (phrase: Phrase) => say(language, phrase),
      chosen,
      ready,
    }),
    [language, change, chosen, ready],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): Chosen {
  return useContext(LanguageContext);
}
