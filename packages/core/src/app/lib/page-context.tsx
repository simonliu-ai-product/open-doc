import { type Context, createContext, type ReactNode, useContext, useMemo } from 'react';
import { FootnoteCollector } from '../components/footnote';

type PageContextValue = { index: number; total: number };

// Stored on globalThis so the dev (src) and published (dist) copies of this
// module share one context instance — a document imports `@open-document/core`
// (dist) while the viewer imports the source, so without this the provider
// writes to one context and the hook reads from another.
const GLOBAL_KEY = '__open_doc_page_context__';
type GlobalWithCtx = typeof globalThis & {
  [GLOBAL_KEY]?: Context<PageContextValue | null>;
};
const g = globalThis as GlobalWithCtx;
if (!g[GLOBAL_KEY]) {
  g[GLOBAL_KEY] = createContext<PageContextValue | null>(null);
}
const PageContext = g[GLOBAL_KEY];

export function DocPageProvider({
  index,
  total,
  children,
}: PageContextValue & { children?: ReactNode }) {
  const value = useMemo(() => ({ index, total }), [index, total]);
  return (
    <PageContext.Provider value={value}>
      <FootnoteCollector>{children}</FootnoteCollector>
    </PageContext.Provider>
  );
}

/** 1-based page number of the page currently rendering. `0` outside a page. */
export function useDocPageNumber(): number {
  const ctx = useContext(PageContext);
  return ctx ? ctx.index + 1 : 0;
}

/** Total page count of the document being rendered. `0` outside a page. */
export function useDocPageCount(): number {
  const ctx = useContext(PageContext);
  return ctx ? ctx.total : 0;
}
