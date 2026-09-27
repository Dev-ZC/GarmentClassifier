import { useCallback, useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'garment-classifier:theme';
const TRANSITION_MS = 400;

function getInitialTheme(): Theme {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  // The index.html boot script already stamped data-theme, so the first
  // render paints the right palette with no flash or transition.
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const didMount = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);

    // Skip the transition class on mount - only animate real toggles.
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    root.classList.add('theme-transition');
    const timer = setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS);
    return () => clearTimeout(timer);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme };
}
