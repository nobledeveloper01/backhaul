import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { elevation, palette, type Colours, type Elevation } from './tokens';

/**
 * What the user asked for, which is not the same as what is rendered.
 *
 * `system` follows the handset. The other two override it — a driver whose
 * phone is in dark mode may still want the brighter screen in a cab at
 * midday, and a shipper reading a settlement in an office may want the
 * opposite.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Light, deliberately.
 *
 * Not `system`. This is read outdoors in Nigerian daylight far more often than
 * it is read in the dark, and a phone that happens to be in dark mode should
 * not decide that for a driver at a loading bay at noon. Anyone who wants dark
 * can say so, and the choice sticks for the session.
 */
const DEFAULT: ThemePreference = 'light';

const STORAGE_KEY = 'backhaul.appearance.v1';

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

interface Theme {
  readonly colours: Colours;
  readonly isDark: boolean;
  readonly elevation: Elevation;
  readonly preference: ThemePreference;
  readonly setPreference: (next: ThemePreference) => void;
}

const ThemeContext = createContext<Theme>({
  colours: palette.light,
  isDark: false,
  elevation: elevation.light,
  preference: DEFAULT,
  setPreference: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(DEFAULT);

  const isDark = preference === 'system' ? scheme === 'dark' : preference === 'dark';

  // Read once at start-up.
  //
  // The app renders in the default while this resolves, which is a frame or
  // two of light before a dark-preferring user's choice lands. That is the
  // right way round: starting dark and flashing to light would be worse, and
  // blocking the first render on a disk read to avoid it would be worse still.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && isPreference(stored)) {
          setPreference(stored);
        }
      } catch {
        // Unreadable storage is not a reason to fail to start. The default is
        // a perfectly good answer and the user can set it again.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const change = useCallback((next: ThemePreference) => {
    setPreference(next);
    // Fire and forget. The choice has already taken effect on screen; a write
    // that fails costs the user the same tap next launch and nothing more, and
    // there is nothing useful to tell them about it.
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<Theme>(
    () => ({
      colours: isDark ? palette.dark : palette.light,
      isDark,
      elevation: isDark ? elevation.dark : elevation.light,
      preference,
      setPreference: change,
    }),
    [isDark, preference, change],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useColours(): Colours {
  return useContext(ThemeContext).colours;
}

export function useElevation(): Elevation {
  return useContext(ThemeContext).elevation;
}
