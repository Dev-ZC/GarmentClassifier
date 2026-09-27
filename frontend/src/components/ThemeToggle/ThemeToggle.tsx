import { IconMoon, IconSun } from '../icons';
import type { Theme } from '../../hooks/useTheme';
import './ThemeToggle.css';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      data-tip={isDark ? 'Light mode' : 'Dark mode'}
      className={`theme-toggle ${isDark ? 'theme-toggle--dark' : ''}`}
      onClick={onToggle}
    >
      <span className="theme-toggle__end theme-toggle__end--sun">
        <IconSun size={13} />
      </span>
      <span className="theme-toggle__end theme-toggle__end--moon">
        <IconMoon size={12} />
      </span>
      <span className="theme-toggle__knob">
        <IconSun size={13} />
        <IconMoon size={12} />
      </span>
    </button>
  );
}
