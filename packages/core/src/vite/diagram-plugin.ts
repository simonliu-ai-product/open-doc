import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';
import { compileDiagram, DiagramSyntaxError } from '../diagram/index.ts';

const DIAGRAM_RE = /\.(mmd|mermaid)$/i;

/**
 * Makes `import chart from './architecture.mmd'` a themed SVG at build time.
 *
 * The same rule as `data-plugin` applies, and for the same reason: the flow
 * packer measures the real DOM to decide where pages break, so a drawing that
 * renders a tick later renders after the layout is decided. Compiling in the
 * plugin also means no diagram library reaches the browser bundle — the SVG
 * arrives as text, already sized.
 *
 * `?raw` and `?url` are left to Vite.
 */
export function diagramPlugin(): Plugin {
  return {
    name: 'open-doc:diagram',
    enforce: 'pre',
    async load(id) {
      const [file, query] = id.split('?');
      if (query !== undefined) return null;
      if (!DIAGRAM_RE.test(file)) return null;

      let text: string;
      try {
        text = await fs.readFile(file, 'utf8');
      } catch {
        return null;
      }

      try {
        // Two diagrams on one page would otherwise share an arrowhead marker id.
        const suffix = path.basename(file).replace(/[^a-zA-Z0-9]/g, '');
        const compiled = compileDiagram(text, { idSuffix: suffix });
        return [
          `export const svg = ${JSON.stringify(compiled.svg)};`,
          `export const width = ${compiled.width};`,
          `export const height = ${compiled.height};`,
          'export default { svg, width, height };',
        ].join('\n');
      } catch (err) {
        if (err instanceof DiagramSyntaxError) {
          this.error(`${path.relative(process.cwd(), file)}: ${err.message}`);
        }
        throw err;
      }
    },
  };
}
