// Ambient module declarations for assets imported from `docs/<id>/assets/`
// and for the data files the framework parses at build time.
// Mirrors Vite's default asset handling (default export = resolved URL).
//
// Consumers opt in via tsconfig:
//
//   { "compilerOptions": { "types": ["@open-document/core/env"] } }

declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.avif' {
  const src: string;
  export default src;
}
declare module '*.woff' {
  const src: string;
  export default src;
}
declare module '*.woff2' {
  const src: string;
  export default src;
}
declare module '*.ttf' {
  const src: string;
  export default src;
}
declare module '*.otf' {
  const src: string;
  export default src;
}

// Parsed by the `open-doc:data` Vite plugin — the default export is the rows.
declare module '*.csv' {
  type CellValue = string | number | null;
  export const columns: string[];
  export const rows: Array<Record<string, CellValue>>;
  export default rows;
}
declare module '*.tsv' {
  type CellValue = string | number | null;
  export const columns: string[];
  export const rows: Array<Record<string, CellValue>>;
  export default rows;
}

// Compiled by the `open-doc:diagram` Vite plugin — the default export is the
// themed SVG and its natural size, ready for `<Diagram chart={…} />`.
declare module '*.mmd' {
  export const svg: string;
  export const width: number;
  export const height: number;
  const chart: { svg: string; width: number; height: number };
  export default chart;
}
declare module '*.mermaid' {
  export const svg: string;
  export const width: number;
  export const height: number;
  const chart: { svg: string; width: number; height: number };
  export default chart;
}
