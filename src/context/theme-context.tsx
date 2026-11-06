'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'triplea_theme';

// White mode is offered on the admin dashboard only; customer pages are always dark.
const isThemedRoute = (pathname: string | null) => !!pathname && pathname.startsWith('/admin');

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readSavedTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  if (root.getAttribute('data-theme') === next) return;
  // Swap instantly: pause transitions for one frame so nothing fades between palettes
  root.classList.add('theme-switching');
  root.setAttribute('data-theme', next);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('theme-switching'));
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Dark is the default; the admin's saved choice is restored on the dashboard.
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window !== 'undefined' && isThemedRoute(window.location.pathname) ? readSavedTheme() : 'dark'
  );

  // Keep <html> in step with the route: the admin uses the saved theme, every other page is dark
  useEffect(() => {
    if (isThemedRoute(pathname)) {
      const saved = readSavedTheme();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync with the route on navigation
      setThemeState(saved);
      applyTheme(saved);
    } else {
      applyTheme('dark');
    }
  }, [pathname]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore
    }
    if (isThemedRoute(pathname)) applyTheme(next);
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
