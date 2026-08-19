export type {
  DataAlign,
  DataColumn,
  DataFormat,
  DataTableProps,
} from './app/components/data-table.tsx';
export { DataTable } from './app/components/data-table.tsx';
export type { DiagramProps, DiagramSource } from './app/components/diagram.tsx';
export { Diagram } from './app/components/diagram.tsx';
export type { FootnoteProps, FootnotesProps } from './app/components/footnote.tsx';
export { Footnote, Footnotes } from './app/components/footnote.tsx';
export type { ImagePlaceholderProps } from './app/components/image-placeholder.tsx';
export { ImagePlaceholder } from './app/components/image-placeholder.tsx';
export type { FigureProps, ListOfProps, RefProps } from './app/components/numbering.tsx';
export { Figure, ListOf, ListOfFigures, ListOfTables, Ref } from './app/components/numbering.tsx';
export type { TableOfContentsProps } from './app/components/table-of-contents.tsx';
export { TableOfContents } from './app/components/table-of-contents.tsx';
export type {
  DesignFonts,
  DesignPalette,
  DesignSystem,
  DesignTypeScale,
} from './app/lib/design.ts';
export { cssVarsToString, defaultDesign, designToCssVars } from './app/lib/design.ts';
export type { BlockMetrics, PaginationResult } from './app/lib/flow.ts';
export { flow, isFlowSection, paginateBlocks } from './app/lib/flow.ts';
export type { LabelEntry, LabelKind, LabelVocabulary } from './app/lib/labels.ts';
export { useDocLabel, useDocLabels } from './app/lib/labels.ts';
export type { OutlineEntry } from './app/lib/outline.ts';
export { useDocOutline } from './app/lib/outline.ts';
export { useDocPageCount, useDocPageNumber } from './app/lib/page-context.tsx';
export type {
  DocEntry,
  DocMeta,
  DocModule,
  DocPage,
  FlowSection,
  Orientation,
  PageGeometry,
  PageSizeName,
} from './app/lib/sdk.ts';
export { DEFAULT_PAGE_SIZE, PAGE_SIZES, resolvePageGeometry } from './app/lib/sdk.ts';
export type { OpenDocBuildConfig, OpenDocConfig } from './config.ts';
export type { CellValue, DelimitedTable } from './data/delimited.ts';
export { parseDelimited } from './data/delimited.ts';
export type { CompiledDiagram, CompileOptions } from './diagram/index.ts';
export { compileDiagram, DiagramSyntaxError } from './diagram/index.ts';
