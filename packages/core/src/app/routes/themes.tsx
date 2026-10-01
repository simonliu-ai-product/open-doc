import { ArrowLeft, Palette } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import {
  CARD_GRID,
  CARD_WIDTH,
  CardText,
  EmptyState,
  PageHeader,
} from '../components/browser/browser-ui';
import { Markdown } from '../components/themes/markdown';
import { ThemePreview } from '../components/themes/theme-preview';
import { docsByTheme } from '../lib/docs';
import { findTheme, themes } from '../lib/themes';

const DETAIL_WIDTH = 260;

export function ThemesGalleryPage() {
  return (
    <div>
      <PageHeader
        title="Themes"
        description={
          <>
            Every <code className="font-mono">.md</code> file under{' '}
            <code className="font-mono">themes/</code>. A theme is documentation — palette, type
            scale, and paste-ready components a document copies from.
          </>
        }
      />

      {themes.length === 0 ? (
        <EmptyState icon={Palette} title="No themes yet">
          Ask your agent for the <code className="font-mono">create-theme</code> skill, or add{' '}
          <code className="font-mono">themes/&lt;id&gt;.md</code>.
        </EmptyState>
      ) : (
        <div className={CARD_GRID}>
          {themes.map((theme) => (
            <Link
              key={theme.id}
              to={`/themes/${theme.id}`}
              className="group flex flex-col gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4"
            >
              <div className="w-fit rounded-md transition-shadow group-hover:shadow-lg">
                <ThemePreview theme={theme} width={CARD_WIDTH} />
              </div>
              <CardText
                title={<span className="group-hover:underline">{theme.name}</span>}
                meta={theme.description || theme.id}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemeDetailPage() {
  const { themeId } = useParams<{ themeId: string }>();
  const theme = findTheme(themeId);

  if (!theme) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-sm">Theme “{themeId}” not found.</p>
        <Link to="/themes" className="mt-3 inline-block text-muted-foreground text-xs underline">
          Back to themes
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
        Themes
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
          <span className="text-muted-foreground text-xs">Used by</span>
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
