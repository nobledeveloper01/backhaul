import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useColorScheme } from 'react-native';

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

  const change = useCallback((next: ThemePreference) => setPreference(next), []);

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
