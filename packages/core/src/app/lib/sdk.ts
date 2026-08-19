import type { ComponentType, ReactNode } from 'react';
import type { DesignSystem } from './design.ts';
import type { LabelVocabulary } from './labels.ts';

export type PageSizeName = 'A4' | 'Letter' | 'A5' | 'Legal';

export type Orientation = 'portrait' | 'landscape';

/**
 * Page dimensions in CSS pixels at 96dpi — the unit authors write in — paired
 * with the physical `@page size` used when printing. Keeping both means a page
 * laid out at 794×1123 on screen maps to a real A4 sheet with no rescaling.
 */
export const PAGE_SIZES: Record<PageSizeName, { width: number; height: number; css: string }> = {
  A4: { width: 794, height: 1123, css: '210mm 297mm' },
  Letter: { width: 816, height: 1056, css: '8.5in 11in' },
  A5: { width: 559, height: 794, css: '148mm 210mm' },
  Legal: { width: 816, height: 1344, css: '8.5in 14in' },
};

export const DEFAULT_PAGE_SIZE: PageSizeName = 'A4';

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
  return {
    width: landscape ? size.height : size.width,
    height: landscape ? size.width : size.height,
    css: landscape ? `${size.css} landscape` : size.css,
  };
}
