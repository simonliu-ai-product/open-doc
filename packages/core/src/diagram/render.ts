import { type LaidOutDiagram, type LaidOutEdge, type LaidOutNode, measureText } from './layout.ts';

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

/**
 * Every colour and face is a `--od-*` variable rather than a literal, which is
 * the entire reason this renderer exists: the drawing inherits the document's
 * theme, in the viewer and in the PDF, instead of arriving with a palette of
 * its own.
 */
function shapePath(node: LaidOutNode): string {
  const { x, y, width: w, height: h } = node;
  const common = 'fill="var(--od-bg)" stroke="var(--od-text)" stroke-width="1.25"';

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
    case 'round':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ry="10" ${common} />`;
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="var(--od-radius, 2)" ${common} />`;
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
        `font-family="var(--od-font-body)" font-size="${fontSize}" fill="var(--od-text)">` +
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
    `<path d="${d}" fill="none" stroke="var(--od-text)" stroke-width="${width}"` +
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
    `width="${round(width)}" height="${round(size * 1.6)}" fill="var(--od-bg)" />` +
    `<text x="${round(edge.labelAt.x)}" y="${round(edge.labelAt.y + size * 0.34)}" ` +
    `text-anchor="middle" font-family="var(--od-font-body)" font-size="${size}" ` +
    `fill="var(--od-muted)">${escapeXml(edge.label)}</text>`
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
    `<path d="M0,1 L10,5 L0,9 z" fill="var(--od-text)" /></marker></defs>`;

  const body = [
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
