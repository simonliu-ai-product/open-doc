/**
 * `w:rPr` and `w:pPr`, written against a base. A style is written in full; a
 * paragraph or run writes only what differs from its style, so restyling
 * Heading 2 in Word restyles every heading instead of none of them.
 *
 * Child order follows the schema sequence. Word is strict about it: an element
 * out of place is "unreadable content", not a warning.
 */

import type { Border, Borders, ParagraphProps, RunStyle, Sides, TabStop } from './model';
import { el } from './xml';

export type StylePara = {
  align?: ParagraphProps['align'];
  spaceBefore: number;
  spaceAfter: number;
  line?: number;
  keepNext?: boolean;
};

export function runPropsXml(
  run: RunStyle,
  base: RunStyle | null,
  opts: { eastAsiaHint?: boolean; lang?: string } = {},
): string {
  const out: string[] = [];

  const fontsDiffer =
    !base || run.fonts.ascii !== base.fonts.ascii || run.fonts.eastAsia !== base.fonts.eastAsia;
  if (fontsDiffer || opts.eastAsiaHint) {
    out.push(
      el('w:rFonts', {
        'w:ascii': fontsDiffer ? run.fonts.ascii : undefined,
        'w:hAnsi': fontsDiffer ? run.fonts.ascii : undefined,
        'w:eastAsia': fontsDiffer ? run.fonts.eastAsia : undefined,
        'w:cs': fontsDiffer ? run.fonts.ascii : undefined,
        // Quotes and dashes sit in ranges both scripts claim. The hint is how
        // Word knows that a “ inside Chinese text is set in the CJK face.
        'w:hint': opts.eastAsiaHint ? 'eastAsia' : undefined,
      }),
    );
  }

  const toggle = (name: string, value: boolean, was: boolean | undefined) => {
    if (base ? value !== Boolean(was) : value) out.push(el(name, value ? {} : { 'w:val': '0' }));
  };
  toggle('w:b', run.bold, base?.bold);
  toggle('w:bCs', run.bold, base?.bold);
  toggle('w:i', run.italic, base?.italic);
  toggle('w:iCs', run.italic, base?.italic);
  toggle('w:caps', Boolean(run.caps), base?.caps);
  toggle('w:smallCaps', Boolean(run.smallCaps), base?.smallCaps);
  toggle('w:strike', run.strike, base?.strike);

  if (!base || run.color !== base.color) out.push(el('w:color', { 'w:val': run.color }));
  if ((run.spacing ?? 0) !== (base?.spacing ?? 0)) {
    out.push(el('w:spacing', { 'w:val': run.spacing ?? 0 }));
  }
  if (!base || run.size !== base.size) {
    out.push(el('w:sz', { 'w:val': run.size }), el('w:szCs', { 'w:val': run.size }));
  }
  if (base ? run.underline !== base.underline : run.underline) {
    out.push(el('w:u', { 'w:val': run.underline ? 'single' : 'none' }));
  }
  if (run.shading !== base?.shading) out.push(shadingXml(run.shading ?? 'auto'));
  if (run.vertAlign !== base?.vertAlign) {
    out.push(el('w:vertAlign', { 'w:val': run.vertAlign ?? 'baseline' }));
  }
  if (opts.lang) out.push(opts.lang);

  return out.length > 0 ? `<w:rPr>${out.join('')}</w:rPr>` : '';
}

function borderXml(side: string, border: Border): string {
  return el(`w:${side}`, {
    'w:val': border.style,
    'w:sz': border.size,
    'w:space': border.space,
    'w:color': border.color,
  });
}

export function bordersXml(name: string, borders: Borders | undefined): string {
  if (!borders) return '';
  const sides = (['top', 'left', 'bottom', 'right'] as const)
    .map((side) => {
      const border = borders[side];
      return border ? borderXml(side, border) : '';
    })
    .join('');
  return sides ? `<${name}>${sides}</${name}>` : '';
}

export function shadingXml(fill: string | undefined): string {
  return fill ? el('w:shd', { 'w:val': 'clear', 'w:color': 'auto', 'w:fill': fill }) : '';
}

/** A width in twips, as table properties spell one. */
export function dxa(name: string, width: number): string {
  return el(name, { 'w:w': width, 'w:type': 'dxa' });
}

export function cellMarginsXml(name: string, margins: Partial<Sides>): string {
  const sides = (['top', 'left', 'bottom', 'right'] as const)
    .map((side) => {
      const width = margins[side];
      return width === undefined ? '' : dxa(`w:${side}`, width);
    })
    .join('');
  return `<${name}>${sides}</${name}>`;
}

function tabsXml(tabs: TabStop[] | undefined): string {
  if (!tabs || tabs.length === 0) return '';
  const sorted = [...tabs].sort((a, b) => a.pos - b.pos);
  return `<w:tabs>${sorted
    .map((tab) => el('w:tab', { 'w:val': tab.align, 'w:leader': tab.leader, 'w:pos': tab.pos }))
    .join('')}</w:tabs>`;
}

export function paraPropsXml(
  props: ParagraphProps,
  base: StylePara | null,
  opts: {
    pStyle?: string;
    numPr?: { num: number; level: number };
    keepLines?: boolean;
    outlineLevel?: number;
    sectPr?: string;
  } = {},
): string {
  const out: string[] = [];
  if (opts.pStyle) out.push(el('w:pStyle', { 'w:val': opts.pStyle }));

  const keepNext = Boolean(props.keepNext);
  if (base ? keepNext !== Boolean(base.keepNext) : keepNext) {
    out.push(el('w:keepNext', keepNext ? {} : { 'w:val': '0' }));
  }
  if (opts.keepLines) out.push(el('w:keepLines'));
  if (props.pageBreakBefore) out.push(el('w:pageBreakBefore'));
  if (opts.numPr) {
    out.push(
      `<w:numPr>${el('w:ilvl', { 'w:val': opts.numPr.level })}${el('w:numId', { 'w:val': opts.numPr.num })}</w:numPr>`,
    );
  }
  out.push(bordersXml('w:pBdr', props.borders));
  out.push(shadingXml(props.shading));
  out.push(tabsXml(props.tabs));
  if (props.bidi) out.push(el('w:bidi'));

  const spacing: Record<string, number | string | undefined> = {};
  const before = props.spaceBefore ?? 0;
  const after = props.spaceAfter ?? 0;
  if (!base || before !== base.spaceBefore) spacing['w:before'] = before;
  if (!base || after !== base.spaceAfter) spacing['w:after'] = after;
  if (props.line !== undefined && (props.lineExact || !base || props.line !== base.line)) {
    spacing['w:line'] = props.line;
    spacing['w:lineRule'] = props.lineExact ? 'exact' : 'atLeast';
  }
  if (Object.keys(spacing).length > 0) out.push(el('w:spacing', spacing));

  // Zero is written when it is given: a numbered paragraph's own indent is what
  // overrides the numbering level's.
  const indent: Record<string, number | undefined> = {};
  if (props.indentLeft !== undefined) indent['w:left'] = props.indentLeft;
  if (props.indentRight) indent['w:right'] = props.indentRight;
  if (props.firstLine !== undefined) {
    if (props.firstLine < 0) indent['w:hanging'] = -props.firstLine;
    else indent['w:firstLine'] = props.firstLine;
  }
  if (Object.keys(indent).length > 0) out.push(el('w:ind', indent));

  const align = props.align ?? 'left';
  if (base ? align !== (base.align ?? 'left') : align !== 'left') {
    out.push(el('w:jc', { 'w:val': align }));
  }
  if (opts.outlineLevel !== undefined) out.push(el('w:outlineLvl', { 'w:val': opts.outlineLevel }));
  if (props.markSize !== undefined) {
    out.push(
      `<w:rPr>${el('w:sz', { 'w:val': props.markSize })}${el('w:szCs', { 'w:val': props.markSize })}</w:rPr>`,
    );
  }
  if (opts.sectPr) out.push(opts.sectPr);

  const body = out.join('');
  return body ? `<w:pPr>${body}</w:pPr>` : '';
}
