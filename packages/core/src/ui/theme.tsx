import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  presentation: boolean;
  setPresentation: (on: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the preference just isn't remembered.
  }
}

function initialTheme(): ThemeMode {
  const stored = readStored('oslab.theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme);
  const [presentation, setPresentation] = useState(() => readStored('oslab.presentation') === '1');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    writeStored('oslab.theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('presentation', presentation);
    writeStored('oslab.presentation', presentation ? '1' : '0');
  }, [presentation]);

  const value = useMemo(
    () => ({ theme, setTheme, presentation, setPresentation }),
    [theme, presentation],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
