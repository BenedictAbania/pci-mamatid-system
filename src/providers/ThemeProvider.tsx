import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Appearance, ColorSchemeName, Platform } from 'react-native';

export type AppColorScheme = 'light' | 'dark';

type ThemeContextValue = {
  colorScheme: AppColorScheme;
  toggleColorScheme: () => void;
};

const THEME_STORAGE_KEY = 'lakad-theme';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function normalizeColorScheme(scheme: ColorSchemeName | null | undefined): AppColorScheme {
  return scheme === 'dark' ? 'dark' : 'light';
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [systemScheme, setSystemScheme] = useState<AppColorScheme>(() =>
    normalizeColorScheme(Appearance.getColorScheme())
  );
  const [manualScheme, setManualScheme] = useState<AppColorScheme | null>(null);

  useEffect(() => {
    let savedThemeTimer: ReturnType<typeof setTimeout> | undefined;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const savedScheme = window.localStorage.getItem(THEME_STORAGE_KEY);

      if (savedScheme === 'light' || savedScheme === 'dark') {
        savedThemeTimer = setTimeout(() => setManualScheme(savedScheme), 0);
      }
    }

    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(normalizeColorScheme(colorScheme));
    });

    return () => {
      if (savedThemeTimer) clearTimeout(savedThemeTimer);
      subscription.remove();
    };
  }, []);

  const colorScheme = manualScheme ?? systemScheme;

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.style.colorScheme = colorScheme;
    }
  }, [colorScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colorScheme,
      toggleColorScheme: () => {
        setManualScheme((currentScheme) => {
          const nextScheme = (currentScheme ?? systemScheme) === 'dark' ? 'light' : 'dark';

          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.localStorage.setItem(THEME_STORAGE_KEY, nextScheme);
          }

          return nextScheme;
        });
      },
    }),
    [colorScheme, systemScheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used inside AppThemeProvider.');
  }

  return context;
}
