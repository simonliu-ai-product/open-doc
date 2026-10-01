import { ArrowLeft, Palette } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  CARD_GRID,
  CardText,
  EmptyState,
  PageHeader,
  useCardWidth,
} from '../components/browser/browser-ui';
import { Markdown } from '../components/themes/markdown';
import { ThemePreview } from '../components/themes/theme-preview';
import { docsByTheme } from '../lib/docs';
import { useT } from '../lib/i18n';
import type { ThemeMeta } from '../lib/themes';
import { findTheme, themes } from '../lib/themes';

const DETAIL_WIDTH = 260;

export function ThemesGalleryPage() {
  const t = useT();
  return (
    <div>
      <PageHeader title={t('Themes')} icon={Palette} count={themes.length} />

      {themes.length === 0 ? (
        <EmptyState icon={Palette} title={t('No themes yet')}>
          {t('Ask your agent to create a theme from a document you like.')}
        </EmptyState>
      ) : (
        <div className={CARD_GRID}>
          {themes.map((theme) => (
            <ThemeCard key={theme.id} theme={theme} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThemeCard({ theme }: { theme: ThemeMeta }) {
  const [ref, width] = useCardWidth<HTMLAnchorElement>();
  return (
    <Link
      ref={ref}
      to={`/themes/${theme.id}`}
      className="group flex min-w-0 flex-col gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
    >
      <div className="w-fit rounded-md transition-shadow group-hover:shadow-lg">
        <ThemePreview theme={theme} width={width} />
      </div>
      <CardText
        title={<span className="group-hover:underline">{theme.name}</span>}
        meta={theme.description || theme.id}
      />
    </Link>
  );
}

export function ThemeDetailPage() {
  const t = useT();
  const { themeId } = useParams<{ themeId: string }>();
  const theme = findTheme(themeId);

  if (!theme) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-sm">{t('Theme “{id}” not found.', { id: themeId ?? '' })}</p>
        <Link to="/themes" className="mt-3 inline-block text-muted-foreground text-xs underline">
          {t('Back to themes')}
        </Link>
      </div>
    );
  }

  const usedBy = docsByTheme(theme.id);
  const chips = [theme.pageSize, theme.mode].filter(Boolean);

  return (
    <div>
      <Link
        to="/themes"
        className="inline-flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
      >
        <ArrowLeft className="size-3" />
        {t('Themes')}
      </Link>

      <div className="mt-4 flex flex-wrap items-baseline gap-3">
        <h1 className="font-medium text-lg tracking-tight">{theme.name}</h1>
        <code className="font-mono text-muted-foreground text-xs">{theme.id}</code>
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
          >
            {chip}
          </span>
        ))}
      </div>
      {theme.description && (
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{theme.description}</p>
      )}

      <div className="mt-6">
        <ThemePreview theme={theme} width={DETAIL_WIDTH} all />
      </div>

      {usedBy.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-xs">{t('Used by')}</span>
          {usedBy.map((docId) => (
            <Link
              key={docId}
              to={`/d/${docId}`}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] transition-colors hover:bg-accent"
            >
              {docId}
            </Link>
          ))}
        </div>
      )}

      <article className="mt-8 max-w-3xl border-border border-t pt-6">
        <Markdown source={theme.body} />
      </article>
    </div>
  );
}
