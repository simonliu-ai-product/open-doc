import { Check, Copy, FileIcon, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  type Asset,
  formatBytes,
  GLOBAL_SCOPE,
  importSnippet,
  isPreviewable,
  listAssets,
} from '../lib/assets';
import { useT } from '../lib/i18n';
import { cn } from '../lib/utils';

type Group = { scope: string; label: string; assets: Asset[] };

/**
 * The images this document can reach, without leaving it: its own `assets/`
 * folder plus the shared project folder. Clicking one gives the import line to
 * paste into the source.
 */
export function DocAssets({ docId }: { docId: string }) {
  const t = useT();
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const [own, global] = await Promise.all([listAssets(docId), listAssets(GLOBAL_SCOPE)]);
    setGroups([
      { scope: docId, label: 'This document', assets: own.ok ? own.value : [] },
      { scope: GLOBAL_SCOPE, label: 'Project', assets: global.ok ? global.value : [] },
    ]);
  }, [docId]);

  useEffect(() => {
    setGroups(null);
    void load();
    if (!import.meta.hot) return;
    const handler = () => void load();
    import.meta.hot.on('open-doc:files-changed', handler);
    return () => {
      import.meta.hot?.off('open-doc:files-changed', handler);
    };
  }, [load]);

  const copyImport = async (asset: Asset) => {
    try {
      await navigator.clipboard.writeText(importSnippet(asset));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  if (groups === null) {
    return (
      <div className="grid flex-1 place-items-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const empty = groups.every((group) => group.assets.length === 0);

  return (
    <div className="flex-1 overflow-y-auto px-3 pb-6">
      {empty && (
        <p className="px-1 py-2 text-muted-foreground text-xs leading-relaxed">
          {t('No assets yet. Add images from the Assets page.')}
        </p>
      )}

      {groups.map((group) =>
        group.assets.length === 0 ? null : (
          <section key={group.scope} className="mb-4">
            <h3 className="mb-1.5 px-1 text-[10px] text-muted-foreground uppercase tracking-wider">
              {t(group.label)}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {group.assets.map((asset) => (
                <button
                  key={`${group.scope}/${asset.name}`}
                  type="button"
                  title={asset.name}
                  onClick={() => setSelected(asset)}
                  className={cn(
                    'grid h-16 place-items-center overflow-hidden rounded border bg-muted p-1 transition-colors',
                    selected?.url === asset.url
                      ? 'border-foreground'
                      : 'border-border hover:border-foreground/40',
                  )}
                >
                  {isPreviewable(asset.mime) ? (
                    <img
                      src={asset.url}
                      alt={asset.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <FileIcon className="size-4 text-muted-foreground" />
                  )}
                </button>
              ))}
            </div>
          </section>
        ),
      )}

      {selected && (
        <div className="sticky bottom-0 rounded-md border border-border bg-background p-2">
          <p className="truncate font-medium text-[11px]">{selected.name}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {formatBytes(selected.size)}
            {selected.unused ? t(' · unused') : ''}
          </p>
          <code className="mt-1.5 block truncate rounded bg-muted px-1.5 py-1 font-mono text-[10px]">
            {selected.importPath}
          </code>
          <button
            type="button"
            onClick={() => copyImport(selected)}
            className="mt-1.5 flex w-full items-center justify-center gap-1 rounded border border-border px-2 py-1 text-[11px] transition-colors hover:bg-accent"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? t('Copied') : t('Copy import')}
          </button>
        </div>
      )}
    </div>
  );
}
