import {
  type LaidOutDiagram,
  type LaidOutEdge,
  type LaidOutLifeline,
  type LaidOutNode,
  type LaidOutSubgraph,
  measureText,
} from './layout.ts';

export type RenderOptions = {
  fontSize?: number;
  /** Suffix for the arrowhead marker ids, so two diagrams on a page cannot collide. */
  idSuffix?: string;
};

const LINE_HEIGHT = 1.35;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function subgraphMarkup(sg: LaidOutSubgraph, fontSize: number): string {
  const titleSize = round(fontSize * 0.85);
  return (
    `<rect x="${round(sg.x)}" y="${round(sg.y)}" width="${round(sg.width)}" height="${round(sg.height)}" ` +
    `style="rx: var(--od-radius, 4px)" fill="color-mix(in srgb, var(--od-accent, #2563eb) 5%, var(--od-bg, #ffffff))" ` +
    `stroke="var(--od-rule, #d1d5db)" stroke-width="1" stroke-dasharray="4 3" />` +
    `<text x="${round(sg.x + 10)}" y="${round(sg.y + titleSize + 5)}" ` +
    `font-family="var(--od-font-heading, sans-serif)" font-size="${titleSize}" font-weight="600" ` +
    `fill="var(--od-muted, #6b7280)">${escapeXml(sg.label)}</text>`
  );
}

function lifelineMarkup(line: LaidOutLifeline): string {
  return (
    `<line x1="${round(line.x)}" y1="${round(line.y1)}" x2="${round(line.x)}" y2="${round(line.y2)}" ` +
    `stroke="var(--od-rule, #d1d5db)" stroke-width="1.25" stroke-dasharray="4 4" />`
  );
}

/**
 * Every colour and face is a `--od-*` variable rather than a literal, which is
 * the entire reason this renderer exists: the drawing inherits the document's
 * theme, in the viewer and in the PDF, instead of arriving with a palette of
 * its own. Each carries a fallback, since a document without a `design` sets
 * none of them and an unset `fill` paints the shapes solid black.
 */
function shapePath(node: LaidOutNode): string {
  const { x, y, width: w, height: h } = node;
  const common =
    'fill="var(--od-bg, #ffffff)" stroke="var(--od-text, #16181d)" stroke-width="1.25"';

  switch (node.shape) {
    case 'diamond': {
      const points = [
        `${x + w / 2},${y}`,
        `${x + w},${y + h / 2}`,
        `${x + w / 2},${y + h}`,
        `${x},${y + h / 2}`,
      ].join(' ');
      return `<polygon points="${points}" ${common} />`;
    }
    case 'circle':
      return `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" ${common} />`;
    case 'stadium':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" ry="${h / 2}" ${common} />`;
    case 'cylinder': {
      // A database: a body with an elliptical lid, the lid's front edge drawn
      // again over the body so it reads as a rim rather than a flat top.
      const ry = Math.min(8, h / 6);
      const body =
        `M${x},${y + ry} A${w / 2},${ry} 0 0 1 ${x + w},${y + ry} ` +
        `L${x + w},${y + h - ry} A${w / 2},${ry} 0 0 1 ${x},${y + h - ry} Z`;
      const rim = `M${x},${y + ry} A${w / 2},${ry} 0 0 0 ${x + w},${y + ry}`;
      return `<path d="${body}" ${common} /><path d="${rim}" fill="none" stroke="var(--od-text, #16181d)" stroke-width="1.25" />`;
    }
    case 'round':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ry="10" ${common} />`;
    default:
      // `rx` as an attribute takes a length, not a CSS variable; as a style it takes both.
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" style="rx: var(--od-radius, 2px)" ${common} />`;
  }
}

function nodeText(node: LaidOutNode, fontSize: number): string {
  const centreY = node.y + node.height / 2;
  const block = node.lines.length * fontSize * LINE_HEIGHT;
  const firstBaseline = centreY - block / 2 + fontSize * 0.98;

  return node.lines
    .map((line, i) => {
      const y = firstBaseline + i * fontSize * LINE_HEIGHT;
      return (
        `<text x="${node.x + node.width / 2}" y="${y}" text-anchor="middle" ` +
        `font-family="var(--od-font-body, sans-serif)" font-size="${fontSize}" fill="var(--od-text, #16181d)">` +
        `${escapeXml(line)}</text>`
      );
    })
    .join('');
}

function edgePath(edge: LaidOutEdge, marker: string): string {
  const d = edge.points
    .map((point, i) => `${i === 0 ? 'M' : 'L'}${round(point.x)},${round(point.y)}`)
    .join(' ');

  const dash = edge.style === 'dashed' ? ' stroke-dasharray="5 4"' : '';
  const width = edge.style === 'thick' ? 2.25 : 1.25;
  const head = edge.arrow ? ` marker-end="url(#${marker})"` : '';

  return (
    `<path d="${d}" fill="none" stroke="var(--od-text, #16181d)" stroke-width="${width}"` +
    `${dash} stroke-linejoin="round"${head} />`
  );
}

function edgeLabel(edge: LaidOutEdge, fontSize: number): string {
  if (!edge.labelAt || !edge.label) return '';
  const size = fontSize * 0.85;
  // The label sits on the line, so it needs the page colour painted behind it.
  const width = measureText(edge.label, size) + 10;
  return (
    `<rect x="${round(edge.labelAt.x - width / 2)}" y="${round(edge.labelAt.y - size * 0.8)}" ` +
    `width="${round(width)}" height="${round(size * 1.6)}" fill="var(--od-bg, #ffffff)" />` +
    `<text x="${round(edge.labelAt.x)}" y="${round(edge.labelAt.y + size * 0.34)}" ` +
    `text-anchor="middle" font-family="var(--od-font-body, sans-serif)" font-size="${size}" ` +
    `fill="var(--od-muted, #6b7280)">${escapeXml(edge.label)}</text>`
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function renderDiagram(diagram: LaidOutDiagram, options: RenderOptions = {}): string {
  const fontSize = options.fontSize ?? 13;
  const marker = `od-arrow${options.idSuffix ? `-${options.idSuffix}` : ''}`;

  const defs =
    `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" ` +
    `markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0,1 L10,5 L0,9 z" fill="var(--od-text, #16181d)" /></marker></defs>`;

  const body = [
    ...(diagram.subgraphs ?? []).map((sg) => subgraphMarkup(sg, fontSize)),
    ...(diagram.lifelines ?? []).map((ll) => lifelineMarkup(ll)),
    ...diagram.edges.map((edge) => edgePath(edge, marker)),
    ...diagram.nodes.map((node) => shapePath(node)),
    ...diagram.nodes.map((node) => nodeText(node, fontSize)),
    ...diagram.edges.map((edge) => edgeLabel(edge, fontSize)),
  ].join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(diagram.width)} ${round(diagram.height)}" ` +
    `width="${round(diagram.width)}" height="${round(diagram.height)}" role="img">` +
    `${defs}${body}</svg>`
  );
}
