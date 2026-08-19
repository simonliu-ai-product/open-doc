import { PAGE_ATTR, PAGE_INDEX_ATTR } from './outline';
import type { PageGeometry } from './sdk';

export type LayoutRule =
  | 'unresolved-ref'
  | 'page-overflow'
  | 'off-page'
  | 'blank-page'
  | 'oversized-block'
  | 'orphan-heading'
  | 'tiny-text'
  | 'broken-image';

export type LayoutSeverity = 'error' | 'warn';

export type LayoutFinding = {
  /** 1-based sheet the problem is on. */
  page: number;
  rule: LayoutRule;
  severity: LayoutSeverity;
  message: string;
  /** Tag plus a text snippet, so the caller can recognise the element. */
  element?: string;
  /** `line:column` in the document source, from the inspector's `data-od-loc`. */
  loc?: string;
};

export type DiagnoseOptions = {
  /** Flow blocks the packer reported as taller than one page. */
  oversized?: Array<{ section: number; block: number }>;
  /** Slack before a bounds violation counts, in CSS px. Subpixel layout needs some. */
  tolerance?: number;
  /** Smallest computed font size that still reads on paper. */
  minFontSize?: number;
  /** Findings kept per rule per page, so one broken page can't drown the report. */
  perPageLimit?: number;
};

const DEFAULTS = { tolerance: 1, minFontSize: 7, perPageLimit: 3 } as const;

/**
 * The band at the bottom of a sheet where a running footer lives. A heading
 * followed only by content down here is still a dangling heading — the body it
 * introduces went to the next page.
 */
const FOOTER_ZONE_RATIO = 0.12;

const HEADING_SELECTOR = 'h1, h2, h3, h4, [data-od-heading]';
const MEDIA_TAGS = new Set(['IMG', 'SVG', 'CANVAS', 'VIDEO', 'PICTURE', 'IFRAME', 'OBJECT']);
const SNIPPET_MAX = 60;

function snippet(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const tag = el.tagName.toLowerCase();
  if (!text) return tag;
  return `${tag}: ${text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text}`;
}

function locOf(el: Element): string | undefined {
  return el.closest('[data-od-loc]')?.getAttribute('data-od-loc') ?? undefined;
}

function hasOwnText(el: Element): boolean {
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') return true;
  }
  return false;
}

function isPainted(el: Element, rect: DOMRect): boolean {
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

/** Keeps the innermost offender: a wrapper that only overflows because its child does is noise. */
function leafmost(elements: Element[]): Element[] {
  return elements.filter((el) => !elements.some((other) => other !== el && el.contains(other)));
}

function pageNumberOf(frame: Element, fallbackIndex: number): number {
  const declared = Number(frame.getAttribute(PAGE_INDEX_ATTR));
  return (Number.isFinite(declared) ? declared : fallbackIndex) + 1;
}

/**
 * Reads rendered sheets and reports what a person would call a layout mistake:
 * content past the paper edge, an empty sheet, a heading stranded at the foot
 * of a page, type too small to print, an image that never loaded.
 *
 * It runs against the print copy — pages at their true pixel size — so the
 * numbers describe the PDF, not the zoomed-down viewer.
 */
export function diagnosePages(
  root: ParentNode,
  geometry: PageGeometry,
  opts: DiagnoseOptions = {},
): LayoutFinding[] {
  const tolerance = opts.tolerance ?? DEFAULTS.tolerance;
  const minFontSize = opts.minFontSize ?? DEFAULTS.minFontSize;
  const perPageLimit = opts.perPageLimit ?? DEFAULTS.perPageLimit;

  const findings: LayoutFinding[] = [];
  const frames = Array.from(root.querySelectorAll<HTMLElement>(`[${PAGE_ATTR}]`));

  frames.forEach((frame, index) => {
    const page = pageNumberOf(frame, index);
    const frameRect = frame.getBoundingClientRect();
    const descendants = Array.from(frame.querySelectorAll<HTMLElement>('*'));

    const below: Element[] = [];
    const sideways: Element[] = [];
    const tiny: Element[] = [];
    const broken: Element[] = [];
    let hasMedia = false;

    for (const el of descendants) {
      const rect = el.getBoundingClientRect();
      if (!isPainted(el, rect)) continue;
      if (MEDIA_TAGS.has(el.tagName)) hasMedia = true;

      if (rect.bottom > frameRect.bottom + tolerance) below.push(el);
      if (rect.right > frameRect.right + tolerance || rect.left < frameRect.left - tolerance) {
        sideways.push(el);
      }
      if (hasOwnText(el) && Number.parseFloat(getComputedStyle(el).fontSize) < minFontSize) {
        tiny.push(el);
      }
      if (el instanceof HTMLImageElement && el.complete && el.naturalWidth === 0) broken.push(el);
    }

    const text = (frame.textContent ?? '').trim();
    // A page shell always paints — background, borders. What makes a sheet
    // blank is that it carries neither words nor a picture.
    if (text === '' && !hasMedia) {
      findings.push({
        page,
        rule: 'blank-page',
        severity: 'error',
        message: 'The sheet renders nothing — an empty page will still print.',
      });
    }

    for (const el of leafmost(below).slice(0, perPageLimit)) {
      const overshoot = Math.round(el.getBoundingClientRect().bottom - frameRect.bottom);
      findings.push({
        page,
        rule: 'page-overflow',
        severity: 'error',
        message: `Content runs ${overshoot}px past the bottom of the sheet and is clipped in the PDF.`,
        element: snippet(el),
        loc: locOf(el),
      });
    }

    for (const el of leafmost(sideways).slice(0, perPageLimit)) {
      const rect = el.getBoundingClientRect();
      const side = rect.right > frameRect.right + tolerance ? 'right' : 'left';
      const overshoot = Math.round(
        side === 'right' ? rect.right - frameRect.right : frameRect.left - rect.left,
      );
      findings.push({
        page,
        rule: 'off-page',
        severity: 'error',
        message: `Content runs ${overshoot}px past the ${side} edge of the sheet.`,
        element: snippet(el),
        loc: locOf(el),
      });
    }

    for (const el of leafmost(tiny).slice(0, perPageLimit)) {
      const size = Math.round(Number.parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
      findings.push({
        page,
        rule: 'tiny-text',
        severity: 'warn',
        message: `Type is ${size}px — under ${minFontSize}px it stops being readable on paper.`,
        element: snippet(el),
        loc: locOf(el),
      });
    }

    for (const el of broken.slice(0, perPageLimit)) {
      findings.push({
        page,
        rule: 'broken-image',
        severity: 'error',
        message: `Image failed to load: ${(el as HTMLImageElement).getAttribute('src') ?? 'no src'}`,
        element: snippet(el),
        loc: locOf(el),
      });
    }

    for (const el of Array.from(
      frame.querySelectorAll<HTMLElement>('[data-od-ref-unresolved]'),
    ).slice(0, perPageLimit)) {
      findings.push({
        page,
        rule: 'unresolved-ref',
        severity: 'error',
        message: `Cross-reference points at "${el.getAttribute('data-od-ref-unresolved')}", which no figure, table, or footnote declares.`,
        element: snippet(el),
        loc: locOf(el),
      });
    }

    findings.push(...danglingHeadings(frame, frameRect, geometry, page).slice(0, perPageLimit));
  });

  for (const { section, block } of opts.oversized ?? []) {
    findings.push({
      page: 0,
      rule: 'oversized-block',
      severity: 'error',
      message: `Flow section ${section + 1}, block ${block + 1} is taller than one page. Blocks are never split — break it into smaller siblings.`,
    });
  }

  return findings.sort((a, b) => a.page - b.page || rank(b.severity) - rank(a.severity));
}

function rank(severity: LayoutSeverity): number {
  return severity === 'error' ? 1 : 0;
}

function danglingHeadings(
  frame: HTMLElement,
  frameRect: DOMRect,
  geometry: PageGeometry,
  page: number,
): LayoutFinding[] {
  const footerTop = frameRect.bottom - geometry.height * FOOTER_ZONE_RATIO;
  const bodyText = Array.from(frame.querySelectorAll<HTMLElement>('*')).filter(
    (el) => hasOwnText(el) && isPainted(el, el.getBoundingClientRect()),
  );

  const out: LayoutFinding[] = [];
  for (const heading of Array.from(frame.querySelectorAll<HTMLElement>(HEADING_SELECTOR))) {
    // A heading kept out of the outline is decoration — a cover title, a stat
    // label — and is supposed to end its page.
    if (heading.getAttribute('data-od-outline') === 'skip') continue;
    const rect = heading.getBoundingClientRect();
    if (!isPainted(heading, rect)) continue;

    const follows = bodyText.filter(
      (el) =>
        !heading.contains(el) &&
        !el.contains(heading) &&
        el.getBoundingClientRect().top >= rect.bottom - 1,
    );
    // Nothing after it, or nothing except whatever sits in the footer band.
    const hasBody = follows.some((el) => el.getBoundingClientRect().top < footerTop);
    if (hasBody) continue;

    out.push({
      page,
      rule: 'orphan-heading',
      severity: 'warn',
      message: 'Heading ends the page — the section it opens starts on the next sheet.',
      element: snippet(heading),
      loc: locOf(heading),
    });
  }
  return out;
}

export function summarize(findings: LayoutFinding[]): {
  errors: number;
  warnings: number;
  byRule: Record<string, number>;
} {
  const byRule: Record<string, number> = {};
  let errors = 0;
  let warnings = 0;
  for (const finding of findings) {
    byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1;
    if (finding.severity === 'error') errors++;
    else warnings++;
  }
  return { errors, warnings, byRule };
}
