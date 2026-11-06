import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PageFrame } from '../components/page-frame';
import { nextFrame, waitForFonts } from '../lib/print-ready';
import { scanDocument } from '../lib/scan';
import { pageLang, resolvePageGeometry } from '../lib/sdk';
import { useDocModule } from '../lib/use-doc-module';
import { useDocPages } from '../lib/use-doc-pages';

/** Set on the page once it is laid out, numbered and in its fonts — the moment a screenshot is true. */
export const PREVIEW_READY_ATTR = 'data-od-preview-ready';

/**
 * One sheet at its true size with nothing around it: `/d/<id>/preview?p=3`.
 * An agent screenshots it to see what it just changed. Every page is still
 * drawn — contents, figure numbers and cross-references are counted across
 * the whole document — but only the asked-for one is shown.
 */
export function DocPreview() {
  const { docId } = useParams<{ docId: string }>();
  const [params] = useSearchParams();
  const state = useDocModule(docId);
  const doc = state.doc;
  const geometry = useMemo(() => resolvePageGeometry(doc?.meta), [doc?.meta]);
  const { pages, measuring } = useDocPages(doc, geometry);
  const pagesRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  const asked = Number.parseInt(params.get('p') ?? '1', 10);
  const page = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), Math.max(pages.length, 1)) : 1;

  useEffect(() => {
    setReady(false);
    if (state.status !== 'ready' || measuring) return;
    let cancelled = false;
    (async () => {
      await nextFrame();
      await waitForFonts();
      await nextFrame();
      const root = pagesRef.current;
      if (cancelled || !root) return;
      scanDocument(root, doc?.meta);
      // The numbers the scan resolved are drawn on the next commit.
      await nextFrame();
      await nextFrame();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [state.status, doc, measuring]);

  useEffect(() => {
    document.title = doc ? `${doc.meta?.title ?? docId} · p. ${page}` : 'open-doc';
  }, [doc, docId, page]);

  if (state.status === 'error') {
    return (
      <p role="alert" className="p-6 font-mono text-sm">
        {state.error.message}
      </p>
    );
  }

  return (
    <div
      className="min-h-screen bg-white"
      {...{ [PREVIEW_READY_ATTR]: ready ? 'true' : 'false' }}
      data-od-preview-page={page}
      data-od-preview-pages={pages.length}
    >
      <div ref={pagesRef} data-od-viewer="">
        {doc &&
          pages.map((entry, index) => (
            // The other sheets are laid out where they are, out of sight, so
            // what the scan counts on them is counted as the viewer counts it.
            <div
              key={entry.key}
              style={
                index + 1 === page
                  ? undefined
                  : { position: 'absolute', left: -99999, top: 0, visibility: 'hidden' }
              }
              aria-hidden={index + 1 === page ? undefined : true}
            >
              <PageFrame
                index={index}
                total={pages.length}
                geometry={geometry}
                scale={1}
                design={doc.design}
                lang={pageLang(doc.meta)}
                watermark={doc.meta?.watermark}
                flat
              >
                {entry.content}
              </PageFrame>
            </div>
          ))}
      </div>
    </div>
  );
}
