import { Languages } from 'lucide-react';
import { LOCALES, useLocale } from '../lib/i18n';
import { Menu, MenuItem } from './ui/menu';

export function LanguageToggle() {
  const { locale, setLocale, t } = useLocale();

  return (
    <Menu
      trigger={(props) => (
        <button
          type="button"
          aria-label={t('Language')}
          title={t('Language')}
          className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent"
          {...props}
        >
          <Languages className="size-3.5" />
        </button>
      )}
    >
      {(close) =>
        LOCALES.map(({ value, label }) => (
          <MenuItem
            key={value}
            active={locale === value}
            onClick={() => {
              setLocale(value);
              close();
            }}
          >
            {label}
          </MenuItem>
        ))
      }
    </Menu>
  );
}
