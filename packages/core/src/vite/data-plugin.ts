import fs from 'node:fs/promises';
import type { Plugin } from 'vite';
import { parseDelimited } from '../data/delimited.ts';

const DATA_RE = /\.(csv|tsv)$/i;

/**
 * Makes `import rows from './data/q3.csv'` an array of objects at build time.
 *
 * Fetching data at render time is not an option here: the flow packer measures
 * the real DOM to decide where pages break, and both exporters serialize what
 * is on screen. Data that arrives a tick later arrives after the layout is
 * already decided. Resolving it as a module keeps a table's numbers as
 * synchronous as the prose around them, in the dev server and in a static build
 * alike.
 *
 * `?raw` and `?url` are left to Vite.
 */
export function dataPlugin(): Plugin {
  return {
    name: 'open-doc:data',
    enforce: 'pre',
    async load(id) {
      const [file, query] = id.split('?');
      if (query !== undefined) return null;
      if (!DATA_RE.test(file)) return null;

      let text: string;
      try {
        text = await fs.readFile(file, 'utf8');
      } catch {
        return null;
      }

      const table = parseDelimited(text, {
        delimiter: /\.tsv$/i.test(file) ? '\t' : ',',
      });

      return [
        `export const columns = ${JSON.stringify(table.columns)};`,
        `export const rows = ${JSON.stringify(table.rows)};`,
        'export default rows;',
      ].join('\n');
    },
  };
}
