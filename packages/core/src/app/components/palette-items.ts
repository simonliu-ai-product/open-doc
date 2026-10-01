import { FileText, Folder, Image, Monitor, Moon, Palette, Sun } from 'lucide-react';
import { docIds, docTitles } from '../lib/docs';
import type { FoldersManifest } from '../lib/sdk';
import { themes } from '../lib/themes';
import type { PaletteItem } from './command-palette';

/** What the palette offers everywhere: every document, folder, theme and page, and the appearance. */
export function browserItems({
  navigate,
  manifest,
  setTheme,
  exclude,
}: {
  navigate: (to: string) => void;
  manifest: FoldersManifest | null;
  setTheme: (theme: string) => void;
  /** A document not to offer — the one already open. */
  exclude?: string;
}): PaletteItem[] {
  const documents = docIds
    .filter((id) => id !== exclude)
    .map(
      (id): PaletteItem => ({
        id: `doc:${id}`,
        group: 'Documents',
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
      group: 'Folders',
      label: folder.name,
      icon: Folder,
      run: () => navigate(`/?f=${encodeURIComponent(folder.id)}`),
    }),
  );

  const themeItems = themes.map(
    (theme): PaletteItem => ({
      id: `theme:${theme.id}`,
      group: 'Themes',
      label: theme.name,
      keywords: `${theme.id} theme`,
      icon: Palette,
      run: () => navigate(`/themes/${theme.id}`),
    }),
  );

  const pages: PaletteItem[] = [
    {
      id: 'go:docs',
      group: 'Go to',
      label: 'All documents',
      icon: FileText,
      run: () => navigate('/'),
    },
    {
      id: 'go:themes',
      group: 'Go to',
      label: 'Themes',
      icon: Palette,
      run: () => navigate('/themes'),
    },
    ...(import.meta.env.DEV
      ? [
          {
            id: 'go:assets',
            group: 'Go to',
            label: 'Assets',
            icon: Image,
            run: () => navigate('/assets'),
          },
        ]
      : []),
  ];

  const appearance: PaletteItem[] = [
    {
      id: 'theme:light',
      group: 'Appearance',
      label: 'Light theme',
      keywords: 'appearance mode',
      icon: Sun,
      run: () => setTheme('light'),
    },
    {
      id: 'theme:dark',
      group: 'Appearance',
      label: 'Dark theme',
      keywords: 'appearance mode',
      icon: Moon,
      run: () => setTheme('dark'),
    },
    {
      id: 'theme:system',
      group: 'Appearance',
      label: 'System theme',
      keywords: 'appearance mode auto',
      icon: Monitor,
      run: () => setTheme('system'),
    },
  ];

  return [...documents, ...folders, ...pages, ...themeItems, ...appearance];
}
