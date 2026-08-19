import type { Diagram, DiagramEdge, DiagramNode, Direction } from './parse.ts';

export type LaidOutNode = DiagramNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  lines: string[];
};

export type LaidOutEdge = DiagramEdge & {
  /** Polyline through which the link is drawn, in diagram coordinates. */
  points: Array<{ x: number; y: number }>;
  labelAt: { x: number; y: number } | null;
};

export type LaidOutDiagram = {
  direction: Direction;
  nodes: LaidOutNode[];
  edges: LaidOutEdge[];
  width: number;
  height: number;
};

export type LayoutOptions = {
  fontSize?: number;
  /** Gap between consecutive ranks, along the flow direction. */
  rankGap?: number;
  /** Gap between siblings within a rank. */
  nodeGap?: number;
  maxLabelWidth?: number;
  padding?: number;
};

const DEFAULTS = {
  fontSize: 13,
  rankGap: 48,
  nodeGap: 28,
  maxLabelWidth: 190,
  padding: 8,
} satisfies Required<LayoutOptions>;

const PAD_X = 14;
const PAD_Y = 10;
const MIN_WIDTH = 76;
const LINE_HEIGHT = 1.35;

/**
 * Text has to be measured without a DOM: the SVG is produced in the Vite
 * plugin, at build time, where there is no browser to ask. Full-width
 * characters take about one em and Latin about half of one, which is close
 * enough that a box never clips its own label.
 */
export function measureText(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const fullWidth =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6);
    width += fullWidth ? fontSize : fontSize * 0.53;
  }
  return width;
}

/** Wraps on spaces where there are any, and between characters where there are not. */
export function wrapLabel(text: string, fontSize: number, maxWidth: number): string[] {
  const explicit = text.split(/<br\s*\/?>/);
  const lines: string[] = [];

  for (const segment of explicit) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (measureText(trimmed, fontSize) <= maxWidth) {
      lines.push(trimmed);
      continue;
    }

    const words = trimmed.includes(' ') ? trimmed.split(/\s+/) : [...trimmed];
    const joiner = trimmed.includes(' ') ? ' ' : '';
    let current = '';
    for (const word of words) {
      const candidate = current ? current + joiner + word : word;
      if (current && measureText(candidate, fontSize) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 0 ? lines : [''];
}

function sizeOf(node: DiagramNode, lines: string[], fontSize: number) {
  const textWidth = Math.max(...lines.map((line) => measureText(line, fontSize)));
  const textHeight = lines.length * fontSize * LINE_HEIGHT;
  let width = Math.max(MIN_WIDTH, textWidth + PAD_X * 2);
  let height = textHeight + PAD_Y * 2;

  // A rhombus only offers an inscribed rectangle to its label: with half-extents
  // a and b, the text fits when a/(W/2) + b/(H/2) <= 1. Doubling each extent and
  // adding the padding satisfies it with room to spare.
  if (node.shape === 'diamond') {
    width = textWidth * 2 + PAD_X * 2;
    height = textHeight * 2 + PAD_Y * 2;
  }
  if (node.shape === 'circle') {
    const diameter = Math.max(textWidth, textHeight) + PAD_X * 2;
    width = diameter;
    height = diameter;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Ranks by longest path. Edges that close a cycle are excluded from ranking —
 * a feedback arrow in an architecture diagram is normal, and it must not make
 * the graph unrankable.
 */
function assignRanks(nodes: DiagramNode[], edges: DiagramEdge[]): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const outgoing = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of edges) outgoing.get(edge.from)?.push(edge.to);

  const state = new Map<string, 0 | 1 | 2>();
  const backEdges = new Set<string>();
  const key = (from: string, to: string) => `${from} ${to}`;

  const visit = (id: string) => {
    state.set(id, 1);
    for (const next of outgoing.get(id) ?? []) {
      const seen = state.get(next);
      if (seen === 1) backEdges.add(key(id, next));
      else if (seen === undefined) visit(next);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (state.get(id) === undefined) visit(id);

  const forward = edges.filter((e) => !backEdges.has(key(e.from, e.to)));
  const incoming = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const edge of forward) incoming.get(edge.to)?.push(edge.from);

  const rank = new Map<string, number>();
  const resolve = (id: string, guard: Set<string>): number => {
    const cached = rank.get(id);
    if (cached !== undefined) return cached;
    if (guard.has(id)) return 0;
    guard.add(id);
    const parents = incoming.get(id) ?? [];
    const value = parents.length === 0 ? 0 : Math.max(...parents.map((p) => resolve(p, guard) + 1));
    guard.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const id of ids) resolve(id, new Set());
  return rank;
}

/** Barycenter sweeps — cheap, and enough to untangle the graphs a report contains. */
function orderRanks(ranks: string[][], edges: DiagramEdge[]): void {
  const neighbours = new Map<string, { up: string[]; down: string[] }>();
  for (const rank of ranks) {
    for (const id of rank) neighbours.set(id, { up: [], down: [] });
  }
  for (const edge of edges) {
    neighbours.get(edge.to)?.up.push(edge.from);
    neighbours.get(edge.from)?.down.push(edge.to);
  }

  const positions = new Map<string, number>();
  const index = () => {
    for (const rank of ranks) {
      rank.forEach((id, i) => {
        positions.set(id, i);
      });
    }
  };
  index();

  const sweep = (side: 'up' | 'down') => {
    for (const rank of ranks) {
      const scored = rank.map((id, i) => {
        const related = neighbours.get(id)?.[side] ?? [];
        const known: number[] = [];
        for (const other of related) {
          const at = positions.get(other);
          if (at !== undefined) known.push(at);
        }
        return { id, score: known.length ? known.reduce((a, b) => a + b, 0) / known.length : i };
      });
      scored.sort((a, b) => a.score - b.score);
      rank.splice(0, rank.length, ...scored.map((s) => s.id));
    }
    index();
  };

  for (let pass = 0; pass < 4; pass += 1) {
    sweep('up');
    sweep('down');
  }
}

/**
 * The point a given fraction along the polyline by length. Taking a *vertex*
 * instead would park every label on an elbow, where two of them meet.
 */
export function pointAlong(
  points: Array<{ x: number; y: number }>,
  fraction: number,
): { x: number; y: number } {
  let total = 0;
  const spans: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const span = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    spans.push(span);
    total += span;
  }

  const target = total * fraction;
  let walked = 0;
  for (let i = 0; i < spans.length; i += 1) {
    if (walked + spans[i] >= target) {
      const into = spans[i] === 0 ? 0 : (target - walked) / spans[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * into,
        y: points[i].y + (points[i + 1].y - points[i].y) * into,
      };
    }
    walked += spans[i];
  }
  return points[points.length - 1];
}

/** Where along an edge a label may sit, tried in order of how central it is. */
const LABEL_STOPS = [0.5, 0.34, 0.66, 0.24, 0.76];

/**
 * Two edges leaving the same node reach their midpoints at the same height, so
 * their labels land on top of each other. Each label slides along its own line
 * until it clears the ones already placed.
 */
function placeLabels(edges: LaidOutEdge[], fontSize: number): void {
  const size = fontSize * 0.85;
  const height = size * 1.7;
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];

  const hits = (a: { x: number; y: number; w: number; h: number }) =>
    placed.some((b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h);

  for (const edge of edges) {
    if (!edge.label) continue;
    const width = measureText(edge.label, size) + 10;
    let chosen = pointAlong(edge.points, LABEL_STOPS[0]);
    for (const stop of LABEL_STOPS) {
      const candidate = pointAlong(edge.points, stop);
      if (!hits({ ...candidate, w: width, h: height })) {
        chosen = candidate;
        break;
      }
    }
    placed.push({ ...chosen, w: width, h: height });
    edge.labelAt = chosen;
  }
}

/** Straight where the two boxes line up, a single elbow where they do not. */
function route(from: LaidOutNode, to: LaidOutNode, horizontal: boolean) {
  const fromCentre = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCentre = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  if (horizontal) {
    const start = { x: from.x + from.width, y: fromCentre.y };
    const end = { x: to.x, y: toCentre.y };
    if (Math.abs(start.y - end.y) < 1 || end.x <= start.x) return [start, end];
    const midX = (start.x + end.x) / 2;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }

  const start = { x: fromCentre.x, y: from.y + from.height };
  const end = { x: toCentre.x, y: to.y };
  if (Math.abs(start.x - end.x) < 1 || end.y <= start.y) return [start, end];
  const midY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

export function layoutDiagram(diagram: Diagram, options: LayoutOptions = {}): LaidOutDiagram {
  const opts = { ...DEFAULTS, ...options };
  const horizontal = diagram.direction === 'LR';

  const lines = new Map<string, string[]>();
  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of diagram.nodes) {
    // A decision wraps earlier than a box: a wide rhombus reads as a bar, and
    // the whole point of the shape is that it is recognisable at a glance.
    const limit =
      node.shape === 'diamond' ? Math.max(84, opts.maxLabelWidth * 0.5) : opts.maxLabelWidth;
    const wrapped = wrapLabel(node.label, opts.fontSize, limit);
    lines.set(node.id, wrapped);
    sizes.set(node.id, sizeOf(node, wrapped, opts.fontSize));
  }

  const rankOf = assignRanks(diagram.nodes, diagram.edges);
  const depth = Math.max(...rankOf.values()) + 1;
  const ranks: string[][] = Array.from({ length: depth }, () => []);
  for (const node of diagram.nodes) ranks[rankOf.get(node.id) ?? 0].push(node.id);
  orderRanks(ranks, diagram.edges);

  // Along the flow: each rank sits past the deepest node of the one before it.
  const rankOffset: number[] = [];
  let cursor = opts.padding;
  for (const rank of ranks) {
    rankOffset.push(cursor);
    const extent = Math.max(
      ...rank.map((id) => {
        const size = sizes.get(id);
        return horizontal ? (size?.width ?? 0) : (size?.height ?? 0);
      }),
    );
    cursor += extent + opts.rankGap;
  }

  // Across the flow: lay each rank out end to end, then centre the ranks on
  // each other so the drawing reads as a column rather than a staircase.
  const cross = new Map<string, number>();
  const rankSpan: number[] = [];
  ranks.forEach((rank, i) => {
    let offset = 0;
    for (const id of rank) {
      const size = sizes.get(id);
      const extent = horizontal ? (size?.height ?? 0) : (size?.width ?? 0);
      cross.set(id, offset + extent / 2);
      offset += extent + opts.nodeGap;
    }
    rankSpan[i] = Math.max(0, offset - opts.nodeGap);
  });

  const widest = Math.max(...rankSpan, 0);
  ranks.forEach((rank, i) => {
    const shift = (widest - rankSpan[i]) / 2 + opts.padding;
    for (const id of rank) cross.set(id, (cross.get(id) ?? 0) + shift);
  });

  const nodes: LaidOutNode[] = diagram.nodes.map((node) => {
    const size = sizes.get(node.id) ?? { width: MIN_WIDTH, height: 40 };
    const along = rankOffset[rankOf.get(node.id) ?? 0];
    const crossCentre = cross.get(node.id) ?? 0;
    return {
      ...node,
      lines: lines.get(node.id) ?? [node.label],
      width: size.width,
      height: size.height,
      x: horizontal ? along : crossCentre - size.width / 2,
      y: horizontal ? crossCentre - size.height / 2 : along,
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: LaidOutEdge[] = [];
  for (const edge of diagram.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const points = route(from, to, horizontal);
    edges.push({ ...edge, points, labelAt: null });
  }
  placeLabels(edges, opts.fontSize);

  const width = Math.max(...nodes.map((n) => n.x + n.width)) + opts.padding;
  const height = Math.max(...nodes.map((n) => n.y + n.height)) + opts.padding;
  return { direction: diagram.direction, nodes, edges, width, height };
}
