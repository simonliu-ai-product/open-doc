import { FileText, Folder, Image, Languages, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { docIds, docTitles } from '../lib/docs';
import { LOCALES, type Locale, type Translate } from '../lib/i18n';
import type { FoldersManifest } from '../lib/sdk';
import { themes } from '../lib/themes';
import type { PaletteItem } from './command-palette';

/** What the palette offers everywhere: every document, folder, theme and page, and the appearance. */
export function browserItems({
  navigate,
  manifest,
  setTheme,
  t,
  setLocale,
  exclude,
}: {
  navigate: (to: string) => void;
  manifest: FoldersManifest | null;
  setTheme: (theme: string) => void;
  t: Translate;
  /** Offers the languages too; left out where switching would not be expected. */
  setLocale?: (locale: Locale) => void;
  /** A document not to offer — the one already open. */
  exclude?: string;
}): PaletteItem[] {
  const documents = docIds
    .filter((id) => id !== exclude)
    .map(
      (id): PaletteItem => ({
        id: `doc:${id}`,
        group: t('Documents'),
        label: docTitles[id] ?? id,
        keywords: id,
        icon: FileText,
        run: () => navigate(`/d/${id}`),
      }),
    )
    .sort((a, b) => a.label.localeCompare(b.label));

  const folders = (manifest?.folders ?? []).map(
    (folder): PaletteItem => ({
      id: `folder:${folder.id}`,
      group: t('Folders'),
      label: folder.name,
      icon: Folder,
      run: () => navigate(`/?f=${encodeURIComponent(folder.id)}`),
    }),
  );

  const themeItems = themes.map(
    (theme): PaletteItem => ({
      id: `theme:${theme.id}`,
      group: t('Themes'),
      label: theme.name,
      keywords: `${theme.id} theme`,
      icon: Palette,
      run: () => navigate(`/themes/${theme.id}`),
    }),
  );

  const pages: PaletteItem[] = [
    {
      id: 'go:docs',
      group: t('Go to'),
      label: t('All documents'),
      icon: FileText,
      run: () => navigate('/'),
    },
    {
      id: 'go:themes',
      group: t('Go to'),
      label: t('Themes'),
      icon: Palette,
      run: () => navigate('/themes'),
    },
    ...(import.meta.env.DEV
      ? [
          {
            id: 'go:assets',
            group: t('Go to'),
            label: t('Assets'),
            icon: Image,
            run: () => navigate('/assets'),
          },
        ]
      : []),
  ];

  const appearance: PaletteItem[] = [
    {
      id: 'theme:light',
      group: t('Appearance'),
      label: t('Light theme'),
      keywords: 'appearance mode',
      icon: Sun,
      run: () => setTheme('light'),
    },
    {
      id: 'theme:dark',
      group: t('Appearance'),
      label: t('Dark theme'),
      keywords: 'appearance mode',
      icon: Moon,
      run: () => setTheme('dark'),
    },
    {
      id: 'theme:system',
      group: t('Appearance'),
      label: t('System theme'),
      keywords: 'appearance mode auto',
      icon: Monitor,
      run: () => setTheme('system'),
    },
  ];

  const languages: PaletteItem[] = setLocale
    ? LOCALES.map(({ value, label }) => ({
        id: `locale:${value}`,
        group: t('Language'),
        label,
        keywords: 'language 語言',
        icon: Languages,
        run: () => setLocale(value),
      }))
    : [];

  return [...documents, ...folders, ...pages, ...themeItems, ...appearance, ...languages];
}
