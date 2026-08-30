import type { ComponentType, ReactNode } from 'react';
import type { DesignSystem } from './design.ts';
import type { LabelVocabulary } from './labels.ts';

/** The only sheets a document may be laid out on. */
export const PAGE_SIZE_NAMES = ['A4', 'B4', 'A3'] as const;

export type PageSizeName = (typeof PAGE_SIZE_NAMES)[number];

export const ORIENTATIONS = ['portrait', 'landscape'] as const;

export type Orientation = (typeof ORIENTATIONS)[number];

/**
 * Portrait dimensions in CSS pixels at 96dpi — the unit authors write in —
 * paired with the physical millimetres used when printing. Keeping both means a
 * page laid out at 794×1123 on screen maps to a real A4 sheet with no rescaling.
 */
export const PAGE_SIZES: Record<
  PageSizeName,
  { width: number; height: number; mm: readonly [number, number] }
> = {
  A4: { width: 794, height: 1123, mm: [210, 297] },
  // JIS B4, not the ISO B4 (250×353mm) that the CSS `size: B4` keyword means —
  // which is why the descriptor is written in millimetres rather than by name.
  B4: { width: 971, height: 1376, mm: [257, 364] },
  A3: { width: 1123, height: 1587, mm: [297, 420] },
};

export const DEFAULT_PAGE_SIZE: PageSizeName = 'A4';

export const DEFAULT_ORIENTATION: Orientation = 'portrait';

export function isPageSizeName(value: unknown): value is PageSizeName {
  return typeof value === 'string' && value in PAGE_SIZES;
}

export function isOrientation(value: unknown): value is Orientation {
  return value === 'portrait' || value === 'landscape';
}

export type PageGeometry = {
  width: number;
  height: number;
  /** Value for the `@page { size: … }` descriptor, orientation included. */
  css: string;
};

export type DocPage = ComponentType;

/**
 * A run of continuous content the framework paginates itself. Build one with
 * `flow(...)` and put it in the page array alongside fixed pages.
 */
export type FlowSection = {
  readonly __odFlow: true;
  blocks: ReactNode[];
  /** Rendered on every page the section expands into. */
  footer?: ComponentType;
  /** Page padding override in px; defaults to the design's `margin`. */
  padding?: number;
};

/** What a document's default export may contain: fixed pages, flow sections, or both. */
export type DocEntry = DocPage | FlowSection;

export type DocMeta = {
  title?: string;
  subtitle?: string;
  author?: string;
  pageSize?: PageSizeName;
  orientation?: Orientation;
  /** Id of a theme under `themes/` this document was built from. Adds a back-link. */
  theme?: string;
  /** ISO 8601 timestamp. Set once at scaffold time; used to sort the doc list. */
  createdAt?: string;
  /** What numbered items are called — `圖`/`表` instead of `Figure`/`Table`. */
  labels?: Partial<LabelVocabulary>;
};

export type FolderIcon = { type: 'emoji'; value: string } | { type: 'color'; value: string };

export type Folder = {
  id: string;
  name: string;
  icon: FolderIcon;
};

export type FoldersManifest = {
  folders: Folder[];
  assignments: Record<string, string>;
};

export type DocModule = {
  default: DocEntry[];
  meta?: DocMeta;
  design?: DesignSystem;
};

export function resolvePageGeometry(meta?: DocMeta): PageGeometry {
  const size = PAGE_SIZES[meta?.pageSize ?? DEFAULT_PAGE_SIZE] ?? PAGE_SIZES[DEFAULT_PAGE_SIZE];
  const landscape = meta?.orientation === 'landscape';
  const [across, down] = landscape ? [size.mm[1], size.mm[0]] : size.mm;
  return {
    width: landscape ? size.height : size.width,
    height: landscape ? size.width : size.height,
    // Not `<mm> <mm> landscape`: the `landscape` keyword is only valid next to a
    // page-size *name*, and Chromium drops the whole descriptor if it sees both,
    // which silently prints a landscape sheet at the dialog's default size.
    css: `${across}mm ${down}mm`,
  };
}
