import { useEffect, useState } from 'react';
import { type DocPage, isPageSizeName, resolvePageGeometry } from '../../lib/sdk';
import { loadThemeDemo, type ThemeDemoModule, type ThemeMeta } from '../../lib/themes';
import { PageFrame } from '../page-frame';

type Props = {
  theme: ThemeMeta;
  width: number;
  /** Render every demo page instead of just the first. */
  all?: boolean;
};

export function ThemePreview({ theme, width, all = false }: Props) {
  const [demo, setDemo] = useState<ThemeDemoModule | null>(null);

  useEffect(() => {
    if (!theme.hasDemo) return;
    let cancelled = false;
    loadThemeDemo(theme.id)
      .then((mod) => {
        if (!cancelled) setDemo(mod);
      })
      .catch(() => {
        if (!cancelled) setDemo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [theme.id, theme.hasDemo]);

  const geometry = resolvePageGeometry(
    isPageSizeName(theme.pageSize) ? { pageSize: theme.pageSize } : undefined,
  );
  const scale = width / geometry.width;
  const pages = (demo?.default ?? []).filter(
    (entry): entry is DocPage => typeof entry === 'function',
  );
  const shown = all ? pages : pages.slice(0, 1);

  if (shown.length === 0) {
    return (
      <div
        className="grid place-items-center rounded-md border border-border border-dashed bg-muted text-[11px] text-muted-foreground"
        style={{ width, height: geometry.height * scale }}
      >
        {theme.hasDemo ? 'Loading…' : 'No demo'}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4">
      {shown.map((Page, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: page order is the identity
          key={index}
          className="overflow-hidden rounded-md ring-1 ring-border"
          style={{ width, height: geometry.height * scale }}
        >
          <PageFrame
            index={index}
            total={pages.length}
            geometry={geometry}
            scale={scale}
            design={demo?.design}
            flat
          >
            <Page />
          </PageFrame>
        </div>
      ))}
    </div>
  );
}
