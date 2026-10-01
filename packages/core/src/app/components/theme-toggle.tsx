import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n';
import { Menu, MenuItem } from './ui/menu';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function ThemeToggle() {
  const t = useT();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <Menu
      trigger={(props) => (
        <button
          type="button"
          aria-label={t('Toggle theme')}
          title={t('Theme')}
          className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent"
          {...props}
        >
          <Sun className="size-3.5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-3.5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </button>
      )}
    >
      {(close) =>
        OPTIONS.map(({ value, label, icon: Icon }) => (
          <MenuItem
            key={value}
            active={mounted && theme === value}
            onClick={() => {
              setTheme(value);
              close();
            }}
          >
            <Icon className="size-3.5" />
            {t(label)}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
