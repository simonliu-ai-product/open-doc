import {
  Check,
  Copy,
  FileIcon,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  PencilLine,
  Trash2,
  Upload,
} from 'lucide-react';
import { type DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CARD_GRID, EmptyState, PageHeader } from '../components/browser/browser-ui';
import { Menu, MenuItem, MenuSeparator } from '../components/ui/menu';
import {
  type Asset,
  deleteAsset,
  formatBytes,
  GLOBAL_SCOPE,
  importSnippet,
  isPreviewable,
  listAssets,
  renameAsset,
  uploadAsset,
} from '../lib/assets';
import { docIds } from '../lib/docs';
import { cn } from '../lib/utils';

export function AssetsPage() {
  const scopes = useMemo(() => [GLOBAL_SCOPE, ...[...docIds].sort()], []);
  const [scope, setScope] = useState<string>(GLOBAL_SCOPE);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async (target: string) => {
    const result = await listAssets(target);
    if (result.ok) {
      setAssets(result.value);
      setError(null);
    } else {
      setAssets([]);
      setError(result.error);
    }
  }, []);

  useEffect(() => {
    setAssets(null);
    void refresh(scope);
  }, [scope, refresh]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setBusy(true);
      setError(null);
      for (const file of Array.from(files)) {
        let result = await uploadAsset(scope, file);
        if (!result.ok && result.error === 'asset exists') {
          const replace = window.confirm(`"${file.name}" already exists in ${scope}. Replace it?`);
          if (!replace) continue;
          result = await uploadAsset(scope, file, { overwrite: true });
        }
        if (!result.ok) setError(`${file.name}: ${result.error}`);
      }
      await refresh(scope);
      setBusy(false);
    },
    [scope, refresh],
  );

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) void upload(e.dataTransfer.files);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: dropping files is an enhancement — "Choose files" is the keyboard path
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
      className={cn(
        'min-h-[60vh] rounded-lg outline-2 outline-offset-8 transition-colors',
        dragging ? 'outline-dashed outline-primary/50' : 'outline-transparent',
      )}
    >
      <PageHeader
        title="Assets"
        icon={ImageIcon}
        count={assets?.length}
        actions={
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-xs transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              Upload
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void upload(e.target.files);
                e.target.value = '';
              }}
            />
          </>
        }
      >
        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">Folder</legend>
          <div className="flex max-w-full gap-0.5 overflow-x-auto rounded-md bg-muted p-0.5">
            {scopes.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={s === scope}
                onClick={() => setScope(s)}
                className={cn(
                  'h-7 flex-none whitespace-nowrap rounded px-3 text-xs text-muted-foreground transition-colors hover:text-foreground',
                  s === scope && 'bg-background text-foreground shadow-sm',
                )}
              >
                {s === GLOBAL_SCOPE ? 'Project' : s}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">Drop files here to upload</p>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-border bg-muted px-3 py-2 text-xs"
          >
            {error}
          </p>
        )}
      </PageHeader>

      {assets === null ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : assets.length === 0 ? (
        <EmptyState icon={ImageIcon} title="No assets yet">
          Drop images here or choose Upload.
        </EmptyState>
      ) : (
        <div className={CARD_GRID}>
          {assets.map((asset) => (
            <AssetCard
              key={asset.name}
              asset={asset}
              scope={scope}
              onChanged={() => refresh(scope)}
              onError={setError}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({
  asset,
  scope,
  onChanged,
  onError,
}: {
  asset: Asset;
  scope: string;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyImport = async () => {
    try {
      await navigator.clipboard.writeText(importSnippet(asset));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (err) {
      onError(String((err as Error).message));
    }
  };

  const rename = async () => {
    const next = window.prompt('New file name', asset.name);
    if (!next || next === asset.name) return;
    const result = await renameAsset(scope, asset.name, next);
    if (!result.ok) onError(`${asset.name}: ${result.error}`);
    onChanged();
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${asset.name}"? This removes the file from disk.`)) return;
    const result = await deleteAsset(scope, asset.name);
    if (!result.ok) onError(`${asset.name}: ${result.error}`);
    onChanged();
  };

  return (
    <div className="group flex flex-col gap-2.5">
      <div
        className={cn(
          'grid aspect-[4/3] place-items-center overflow-hidden rounded-md ring-1 ring-border',
          isPreviewable(asset.mime) ? 'bg-paper' : 'bg-muted',
        )}
      >
        {isPreviewable(asset.mime) ? (
          <img
            src={asset.url}
            alt={asset.name}
            className="max-h-full max-w-full object-contain p-3"
          />
        ) : (
          <FileIcon className="size-6 text-muted-foreground" />
        )}
      </div>

      {/* The name gets the full width — a file name broken mid-extension
          reads as a different file — and the actions sit beside the facts. */}
      <div className="min-w-0">
        <p className="line-clamp-2 font-medium text-sm leading-snug [overflow-wrap:anywhere]">
          {asset.name}
        </p>
        <div className="mt-0.5 flex items-center gap-1">
          <p className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
            {formatBytes(asset.size)}
            {asset.unused ? ' · unused' : ''}
          </p>
          <button
            type="button"
            onClick={copyImport}
            aria-label={`Copy the import line for ${asset.name}`}
            title={importSnippet(asset)}
            className="flex size-7 flex-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
          <Menu
            trigger={(props) => (
              <button
                type="button"
                aria-label={`${asset.name} options`}
                className="flex size-7 flex-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-expanded:bg-accent"
                {...props}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    void copyImport();
                  }}
                >
                  <Copy className="size-3.5" />
                  Copy import line
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    void rename();
                  }}
                >
                  <PencilLine className="size-3.5" />
                  Rename
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  destructive
                  onClick={() => {
                    close();
                    void remove();
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      </div>
    </div>
  );
}
