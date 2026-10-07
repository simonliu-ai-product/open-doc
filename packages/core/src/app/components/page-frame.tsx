import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { type DesignSystem, designToCssVars } from '../lib/design';
import { PAGE_ATTR, PAGE_INDEX_ATTR } from '../lib/outline';
import { DocPageProvider } from '../lib/page-context';
import type { PageGeometry } from '../lib/sdk';

type Props = {
  index: number;
  total: number;
  geometry: PageGeometry;
  scale: number;
  design?: DesignSystem;
  /** The document's language — see `pageLang`. */
  lang?: string;
  flat?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * One sheet of paper. The inner node always lays out at the page's true pixel
 * size — authors write absolute px against A4 — and only the wrapper shrinks,
 * so a page looks identical on screen, in the PDF, and in the HTML export.
 */
export function PageFrame({
  index,
  total,
  geometry,
  scale,
  design,
  lang = 'en',
  flat = false,
  className,
  children,
}: Props) {
  const designVars = design ? designToCssVars(design) : undefined;

  return (
    <div
      className={cn(
        'relative flex-none overflow-hidden bg-white text-black',
        !flat && 'shadow-[0_1px_3px_rgba(0,0,0,.28),0_10px_28px_-6px_rgba(0,0,0,.28)]',
        className,
      )}
      style={{ width: geometry.width * scale, height: geometry.height * scale }}
    >
      <div
        {...{ [PAGE_ATTR]: '', [PAGE_INDEX_ATTR]: index }}
        lang={lang}
        style={
          {
            width: geometry.width,
            height: geometry.height,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            overflow: 'hidden',
            position: 'relative',
            // A page must render identically wherever it is embedded. The
            // thumbnail rail wraps pages in a <button>, whose default
            // `text-align: center` would otherwise leak into the content.
            textAlign: 'start',
            ...(designVars ?? {}),
            ...(designVars ? { background: 'var(--od-bg)', color: 'var(--od-text)' } : {}),
          } as CSSProperties
        }
      >
        <DocPageProvider index={index} total={total}>
          {children}
        </DocPageProvider>
      </div>
    </div>
  );
}
