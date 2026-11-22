import { locOf, pageNumberOf } from './diagnostics';
import { PAGE_ATTR } from './outline';
import type { TextRun } from './proofread';

/** Text a proofreader leaves alone: code, and furigana that sits above a word rather than in it. */
const SKIP = new Set([
  'code',
  'pre',
  'kbd',
  'samp',
  'var',
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
  'rt',
  'rp',
]);

function isInline(el: Element): boolean {
  if (el instanceof SVGElement) return el.tagName === 'tspan' || el.tagName === 'a';
  const display = getComputedStyle(el).display;
  return display === 'inline' || display === 'contents';
}

/**
 * Splits each rendered sheet into runs of text that read as one line of
 * prose: text inside one block, joined across inline marks, cut at every
 * block, line break of a block, and piece of code.
 */
export function collectTextRuns(root: ParentNode): TextRun[] {
  const runs: TextRun[] = [];
  const frames = Array.from(root.querySelectorAll<HTMLElement>(`[${PAGE_ATTR}]`));

  frames.forEach((frame, index) => {
    const page = pageNumberOf(frame, index);
    let text = '';
    let block: Element = frame;

    const flush = () => {
      if (text.trim()) {
        const holder = block.closest('[lang]');
        const lang = holder && frame.contains(holder) ? holder.getAttribute('lang') : null;
        const loc = locOf(block);
        runs.push({ text, page, ...(loc ? { loc } : {}), ...(lang ? { lang } : {}) });
      }
      text = '';
    };

    const walk = (node: Node, container: Element) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (!text) block = container;
          text += (child as Text).data;
          continue;
        }
        if (!(child instanceof Element)) continue;
        if (SKIP.has(child.tagName.toLowerCase()) || child.hasAttribute('data-od-watermark')) {
          flush();
          continue;
        }
        if (child.tagName === 'BR') {
          text += '\n';
          continue;
        }
        if (!(child instanceof SVGElement) && getComputedStyle(child).display === 'none') continue;
        if (isInline(child)) {
          walk(child, container);
          continue;
        }
        flush();
        walk(child, child);
        flush();
      }
    };

    walk(frame, frame);
    flush();
  });

  return runs;
}
