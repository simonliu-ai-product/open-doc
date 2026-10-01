import { Menu as MenuIcon, Search } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useMemo } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CommandPaletteProvider, useCommandPalette } from '../components/command-palette';
import { browserItems } from '../components/palette-items';
import {
  ALL_DOCS_ID,
  ASSETS_ID,
  DRAFT_ID,
  Sidebar,
  THEMES_ID,
} from '../components/sidebar/sidebar';
import { ThemeToggle } from '../components/theme-toggle';
import { Menu, MenuItem } from '../components/ui/menu';
import { useAssetCount } from '../lib/assets';
import { docIds } from '../lib/docs';
import { useFolders } from '../lib/folders';
import type { FoldersManifest } from '../lib/sdk';
import { themes } from '../lib/themes';

export type HomeOutletContext = {
  manifest: FoldersManifest;
  loading: boolean;
  /** Documents with no folder assignment. */
  draftDocs: string[];
  docsByFolder: Record<string, string[]>;
  /** ALL_DOCS_ID, DRAFT_ID, a folder id, THEMES_ID, or ASSETS_ID. */
  selectedId: string;
  selectFolder: (id: string) => void;
  assign: (docId: string, folderId: string | null) => Promise<void>;
  renameDoc: (docId: string, title: string) => Promise<void>;
  duplicateDoc: (docId: string, newId?: string) => Promise<string>;
  deleteDoc: (docId: string) => Promise<void>;
};

function pathToSelectedId(pathname: string, search: URLSearchParams): string {
  if (pathname === '/themes' || pathname.startsWith('/themes/')) return THEMES_ID;
  if (pathname === '/assets') return ASSETS_ID;
  return search.get('f') ?? ALL_DOCS_ID;
}

export function HomeShell() {
  const {
    manifest,
    loading,
    create,
    update,
    remove,
    reorder,
    assign,
    renameDoc,
    duplicateDoc,
    deleteDoc,
  } = useFolders();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const assetCount = useAssetCount();

  const selectedId = pathToSelectedId(location.pathname, searchParams);

  const selectFolder = useCallback(
    (id: string) => {
      if (id === THEMES_ID) navigate('/themes');
      else if (id === ASSETS_ID) navigate('/assets');
      else if (id === ALL_DOCS_ID) navigate('/');
      else navigate(`/?f=${encodeURIComponent(id)}`);
    },
    [navigate],
  );

  const { draftDocs, docsByFolder } = useMemo(() => {
    const byFolder: Record<string, string[]> = {};
    const draft: string[] = [];
    const known = new Set(manifest.folders.map((f) => f.id));
    for (const id of docIds) {
      const folderId = manifest.assignments[id];
      if (folderId && known.has(folderId)) {
        byFolder[folderId] ??= [];
        byFolder[folderId].push(id);
      } else {
        draft.push(id);
      }
    }
    return { draftDocs: draft, docsByFolder: byFolder };
  }, [manifest]);

  const { setTheme } = useTheme();
  const paletteItems = useCallback(
    () => browserItems({ navigate, manifest, setTheme }),
    [navigate, manifest, setTheme],
  );

  const countFor = (folderId: string | null) =>
    folderId === null ? draftDocs.length : (docsByFolder[folderId]?.length ?? 0);

  const ctx: HomeOutletContext = {
    manifest,
    loading,
    draftDocs,
    docsByFolder,
    selectedId,
    selectFolder,
    assign,
    renameDoc,
    duplicateDoc,
    deleteDoc,
  };

  return (
    <CommandPaletteProvider items={paletteItems}>
      <div className="flex h-dvh overflow-hidden bg-background text-foreground">
        <div className="hidden md:block">
          <Sidebar
            folders={manifest.folders}
            countFor={countFor}
            allCount={docIds.length}
            themesCount={themes.length}
            assetsCount={assetCount}
            selectedId={selectedId}
            onSelect={selectFolder}
            onCreate={create}
            onRename={(id, name) => update(id, { name })}
            onChangeIcon={(id, icon) => update(id, { icon })}
            onDelete={async (id) => {
              if (selectedId === id) selectFolder(ALL_DOCS_ID);
              await remove(id).catch(() => {});
            }}
            onDropToFolder={(folderId, docId) => void assign(docId, folderId)}
            onDropToDraft={(docId) => void assign(docId, null)}
            onReorder={(ids) => void reorder(ids).catch(() => {})}
          />
        </div>

        {/* The content sits on its own inset panel, so the sidebar reads as the
          frame around it rather than a column beside it. */}
        <div className="relative flex min-w-0 flex-1 flex-col overflow-y-auto bg-canvas md:my-2 md:mr-2 md:rounded-xl md:border md:border-border">
          <div className="flex items-center justify-between border-border border-b bg-background px-4 py-3 md:hidden">
            <h1 className="font-semibold text-base tracking-tight">open-doc</h1>
            <div className="-mr-1 flex items-center gap-0.5">
              <MobileSearch />
              <ThemeToggle />
              <Menu
                trigger={(props) => (
                  <button
                    type="button"
                    aria-label="Menu"
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-accent"
                    {...props}
                  >
                    <MenuIcon className="size-4" />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem
                      active={selectedId !== THEMES_ID && selectedId !== ASSETS_ID}
                      onClick={() => {
                        selectFolder(ALL_DOCS_ID);
                        close();
                      }}
                    >
                      Documents
                    </MenuItem>
                    <MenuItem
                      active={selectedId === DRAFT_ID}
                      onClick={() => {
                        selectFolder(DRAFT_ID);
                        close();
                      }}
                    >
                      Unfiled
                    </MenuItem>
                    <MenuItem
                      active={selectedId === THEMES_ID}
                      onClick={() => {
                        selectFolder(THEMES_ID);
                        close();
                      }}
                    >
                      Themes
                    </MenuItem>
                    {import.meta.env.DEV && (
                      <MenuItem
                        active={selectedId === ASSETS_ID}
                        onClick={() => {
                          selectFolder(ASSETS_ID);
                          close();
                        }}
                      >
                        Assets
                      </MenuItem>
                    )}
                  </>
                )}
              </Menu>
            </div>
          </div>

          {/* One frame for every page of the browser, so Documents, Themes and
            Assets share their edges; the pages add no padding of their own. */}
          <div className="mx-auto w-full max-w-[1180px] px-5 py-8 md:px-10 md:py-10">
            <Outlet context={ctx} />
          </div>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}

function MobileSearch() {
  const palette = useCommandPalette();
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={palette.open}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Search className="size-4" />
    </button>
  );
}
