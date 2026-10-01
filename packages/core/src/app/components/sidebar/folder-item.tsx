import { FileText, Image, MoreHorizontal, Palette, PencilLine, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../lib/i18n';
import type { Folder, FolderIcon } from '../../lib/sdk';
import { cn } from '../../lib/utils';
import { Menu, MenuItem, MenuSeparator } from '../ui/menu';
import { IconPicker } from './icon-picker';

export const DOC_DND_MIME = 'application/x-open-doc-id';

export type FolderRow =
  | { kind: 'all' }
  | { kind: 'themes' }
  | { kind: 'assets' }
  | { kind: 'draft' }
  | {
      kind: 'folder';
      folder: Folder;
      onRename: (name: string) => void;
      onChangeIcon: (icon: FolderIcon) => void;
      onDelete: () => void;
    };

export function FolderIconChip({ icon }: { icon: FolderIcon }) {
  if (icon.type === 'emoji') {
    return (
      <span className="grid size-5 shrink-0 place-items-center text-[13px] leading-none">
        {icon.value}
      </span>
    );
  }
  return (
    <span
      className="size-3 shrink-0 rounded-[3px] ring-1 ring-black/10"
      style={{ background: icon.value }}
    />
  );
}

const STATIC_ICON = {
  all: FileText,
  themes: Palette,
  assets: Image,
} as const;

export function FolderItem({
  row,
  count,
  selected,
  onSelect,
  onDropDoc,
}: {
  row: FolderRow;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onDropDoc: (docId: string) => void;
}) {
  const t = useT();
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const label =
    row.kind === 'folder'
      ? row.folder.name
      : row.kind === 'all'
        ? t('Documents')
        : row.kind === 'themes'
          ? t('Themes')
          : row.kind === 'assets'
            ? t('Assets')
            : t('Unfiled');

  const acceptsDrop = row.kind === 'folder' || row.kind === 'draft';

  const commitRename = () => {
    if (row.kind !== 'folder') return;
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== row.folder.name) row.onRename(next);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target wraps the button, which stays the keyboard path
    <div
      className={cn(
        'group relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        selected ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60',
        dragOver && 'ring-1 ring-foreground/40',
      )}
      onDragOver={(e) => {
        if (!acceptsDrop || !e.dataTransfer.types.includes(DOC_DND_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!acceptsDrop) return;
        const docId = e.dataTransfer.getData(DOC_DND_MIME);
        setDragOver(false);
        if (!docId) return;
        e.preventDefault();
        onDropDoc(docId);
      }}
    >
      {row.kind === 'folder' ? (
        <Menu
          placement="right-start"
          trigger={(props) => (
            <button
              type="button"
              aria-label={t('Change icon')}
              className="shrink-0 transition-transform hover:scale-110"
              {...props}
            >
              <FolderIconChip icon={row.folder.icon} />
            </button>
          )}
        >
          {() => (
            <div className="p-1">
              <IconPicker value={row.folder.icon} onChange={row.onChangeIcon} />
            </div>
          )}
        </Menu>
      ) : row.kind === 'draft' ? (
        <FolderIconChip icon={{ type: 'color', value: '#9ca3af' }} />
      ) : (
        (() => {
          const Icon = STATIC_ICON[row.kind];
          return <Icon className="size-3.5 shrink-0" />;
        })()
      )}

      {renaming && row.kind === 'folder' ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setRenaming(false);
          }}
          maxLength={40}
          className="min-w-0 flex-1 bg-transparent text-[13px] outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          className="min-w-0 flex-1 truncate text-left text-[13px]"
        >
          {label}
        </button>
      )}

      <span className="font-mono text-[10px] text-muted-foreground tabular-nums group-hover:opacity-0">
        {String(count).padStart(2, '0')}
      </span>

      {row.kind === 'folder' && import.meta.env.DEV && (
        <div className="absolute right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <Menu
            trigger={(props) => (
              <button
                type="button"
                aria-label={t('{name} options', { name: row.folder.name })}
                className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground aria-expanded:bg-background"
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
                    setDraft(row.folder.name);
                    setRenaming(true);
                    close();
                  }}
                >
                  <PencilLine className="size-3.5" />
                  {t('Rename')}
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  destructive
                  onClick={() => {
                    close();
                    row.onDelete();
                  }}
                >
                  <Trash2 className="size-3.5" />
                  {t('Delete folder')}
                </MenuItem>
              </>
            )}
          </Menu>
        </div>
      )}
    </div>
  );
}
