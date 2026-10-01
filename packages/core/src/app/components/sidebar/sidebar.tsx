import config from 'virtual:open-doc/config';
import { Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import type { Folder, FolderIcon } from '../../lib/sdk';
import { cn } from '../../lib/utils';
import { PALETTE_SHORTCUT, useCommandPalette } from '../command-palette';
import { LanguageToggle } from '../language-toggle';
import { ThemeToggle } from '../theme-toggle';
import { FolderIconChip, FolderItem } from './folder-item';
import { IconPicker, PRESET_COLORS } from './icon-picker';

export const ALL_DOCS_ID = '__all__';
export const DRAFT_ID = 'draft';
export const THEMES_ID = '__themes__';
export const ASSETS_ID = '__assets__';

export const FOLDER_DND_MIME = 'application/x-open-doc-folder-id';

type Props = {
  folders: Folder[];
  countFor: (folderId: string | null) => number;
  allCount: number;
  themesCount: number;
  assetsCount: number;
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string, icon: FolderIcon) => Promise<Folder>;
  onRename: (id: string, name: string) => void;
  onChangeIcon: (id: string, icon: FolderIcon) => void;
  onDelete: (id: string) => void;
  onDropToFolder: (folderId: string, docId: string) => void;
  onDropToDraft: (docId: string) => void;
  onReorder: (ids: string[]) => void;
};

export function Sidebar({
  folders,
  countFor,
  allCount,
  themesCount,
  assetsCount,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onChangeIcon,
  onDelete,
  onDropToFolder,
  onDropToDraft,
  onReorder,
}: Props) {
  const t = useT();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; before: boolean } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState<FolderIcon>({ type: 'color', value: PRESET_COLORS[0] });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const finishReorder = (toId: string, before: boolean) => {
    const fromId = dragId;
    setDragId(null);
    setDropTarget(null);
    if (!fromId || fromId === toId) return;
    const ids = folders.map((f) => f.id);
    if (!ids.includes(fromId) || !ids.includes(toId)) return;
    const next = ids.filter((id) => id !== fromId);
    next.splice(next.indexOf(toId) + (before ? 0 : 1), 0, fromId);
    if (next.every((id, i) => id === ids[i])) return;
    onReorder(next);
  };

  const startCreating = () => {
    setNewIcon({ type: 'color', value: PRESET_COLORS[folders.length % PRESET_COLORS.length] });
    setNewName('');
    setCreating(true);
  };

  const commitCreate = async () => {
    const trimmed = newName.trim();
    setCreating(false);
    setNewName('');
    if (!trimmed) return;
    await onCreate(trimmed, newIcon).catch(() => {});
  };

  return (
    <aside className="flex h-full w-[16.5rem] shrink-0 flex-col bg-background">
      <div className="px-4 pt-4 pb-3">
        <h1 className="font-semibold text-base tracking-tight">open-doc</h1>
      </div>

      <div className="px-2 pb-2">
        <SearchField />
      </div>

      <div className="px-2">
        <FolderItem
          row={{ kind: 'all' }}
          count={allCount}
          selected={selectedId === ALL_DOCS_ID}
          onSelect={() => onSelect(ALL_DOCS_ID)}
          onDropDoc={() => {}}
        />
        <FolderItem
          row={{ kind: 'themes' }}
          count={themesCount}
          selected={selectedId === THEMES_ID}
          onSelect={() => onSelect(THEMES_ID)}
          onDropDoc={() => {}}
        />
        {import.meta.env.DEV && (
          <FolderItem
            row={{ kind: 'assets' }}
            count={assetsCount}
            selected={selectedId === ASSETS_ID}
            onSelect={() => onSelect(ASSETS_ID)}
            onDropDoc={() => {}}
          />
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 px-4 pb-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {t('Folders')}
        </span>
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <FolderItem
          row={{ kind: 'draft' }}
          count={countFor(null)}
          selected={selectedId === DRAFT_ID}
          onSelect={() => onSelect(DRAFT_ID)}
          onDropDoc={onDropToDraft}
        />

        {folders.map((folder) => {
          const isTarget = dropTarget?.id === folder.id;
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: drag handle wraps the row, which keeps its own button
            <div
              key={folder.id}
              className={cn(
                'relative',
                isTarget &&
                  dropTarget.before &&
                  'before:-top-px before:absolute before:inset-x-2 before:h-[2px] before:rounded-full before:bg-foreground',
                isTarget &&
                  !dropTarget.before &&
                  'after:-bottom-px after:absolute after:inset-x-2 after:h-[2px] after:rounded-full after:bg-foreground',
                dragId === folder.id && 'opacity-50',
              )}
              draggable={import.meta.env.DEV}
              onDragStart={(e) => {
                if (!import.meta.env.DEV) return;
                e.dataTransfer.setData(FOLDER_DND_MIME, folder.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragId(folder.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(FOLDER_DND_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                if (!dropTarget || dropTarget.id !== folder.id || dropTarget.before !== before) {
                  setDropTarget({ id: folder.id, before });
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                if (dropTarget?.id === folder.id) setDropTarget(null);
              }}
              onDrop={(e) => {
                const fromId = e.dataTransfer.getData(FOLDER_DND_MIME);
                if (!fromId) return;
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                finishReorder(folder.id, e.clientY < rect.top + rect.height / 2);
              }}
            >
              <FolderItem
                row={{
                  kind: 'folder',
                  folder,
                  onRename: (name) => onRename(folder.id, name),
                  onChangeIcon: (icon) => onChangeIcon(folder.id, icon),
                  onDelete: () => onDelete(folder.id),
                }}
                count={countFor(folder.id)}
                selected={selectedId === folder.id}
                onSelect={() => onSelect(folder.id)}
                onDropDoc={(docId) => onDropToFolder(folder.id, docId)}
              />
            </div>
          );
        })}

        {import.meta.env.DEV &&
          (creating ? (
            <div className="mt-1 flex items-center gap-2 rounded-md border border-foreground/30 border-dashed px-2 py-1">
              <FolderIconChip icon={newIcon} />
              <input
                ref={inputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={commitCreate}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === 'Enter') void commitCreate();
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewName('');
                  }
                }}
                placeholder={t('Folder name')}
                maxLength={40}
                className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={startCreating}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-3.5" />
              {t('New folder')}
            </button>
          ))}

        {creating && (
          <div className="mt-1 rounded-md border border-border p-2">
            <IconPicker value={newIcon} onChange={setNewIcon} />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-4 py-3 text-[11px] text-muted-foreground">
        <span>
          v{config.version}
          <span className="ml-2 font-mono">{import.meta.env.DEV ? 'dev' : 'static'}</span>
        </span>
        <div className="-mr-1.5 flex items-center gap-0.5">
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

/** Looks like a field, opens the palette — the same thing ⌘K does, for a pointer. */
function SearchField() {
  const t = useT();
  const palette = useCommandPalette();
  return (
    <button
      type="button"
      onClick={palette.open}
      aria-keyshortcuts="Meta+K Control+K"
      className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-background px-2.5 text-muted-foreground text-xs transition-colors hover:bg-accent hover:text-foreground"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">{t('Search')}</span>
      <kbd className="rounded border border-border px-1 font-mono text-[10px]">
        {PALETTE_SHORTCUT}
      </kbd>
    </button>
  );
}
