export type Direction = 'TD' | 'LR';

export type NodeShape = 'rect' | 'round' | 'stadium' | 'diamond' | 'circle';

export type DiagramNode = {
  id: string;
  label: string;
  shape: NodeShape;
};

export type EdgeStyle = 'solid' | 'dashed' | 'thick';

export type DiagramEdge = {
  from: string;
  to: string;
  label: string | null;
  style: EdgeStyle;
  /** A `---` link draws no arrowhead. */
  arrow: boolean;
};

export type Diagram = {
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

export class DiagramSyntaxError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(`line ${line}: ${message}`);
    this.name = 'DiagramSyntaxError';
    this.line = line;
  }
}

const HEADER_RE = /^(?:flowchart|graph)(?:\s+(TB|TD|BT|LR|RL))?$/i;

/** `A[Label]`, `A(Label)`, `A([Label])`, `A{Label}`, `A((Label))`, or a bare `A`. */
const NODE_RE = /^([A-Za-z0-9_.-]+)(?:(\(\(|\(\[|\[|\(|\{)([\s\S]*?)(\)\)|\]\)|\]|\)|\}))?$/;

const SHAPES: Record<string, NodeShape> = {
  '[': 'rect',
  '(': 'round',
  '([': 'stadium',
  '{': 'diamond',
  '((': 'circle',
};

/**
 * Links, longest first: `-.->` must be tried before `-->` or the dash prefix
 * would match and leave a stray dot in the label.
 */
const LINKS: Array<{ re: RegExp; style: EdgeStyle; arrow: boolean }> = [
  { re: /-\.->/, style: 'dashed', arrow: true },
  { re: /-\.-/, style: 'dashed', arrow: false },
  { re: /==>/, style: 'thick', arrow: true },
  { re: /===/, style: 'thick', arrow: false },
  { re: /-->/, style: 'solid', arrow: true },
  { re: /---/, style: 'solid', arrow: false },
];

function normalizeDirection(raw: string | undefined): Direction {
  const value = (raw ?? 'TD').toUpperCase();
  // Reversed axes are drawn in their natural direction; a proposal diagram
  // gains nothing from BT/RL, and supporting them doubles the layout cases.
  return value === 'LR' || value === 'RL' ? 'LR' : 'TD';
}

function stripComment(line: string): string {
  const at = line.indexOf('%%');
  return at === -1 ? line : line.slice(0, at);
}

/** Splits `A --> B --> C` into consecutive pairs, keeping each link's own style. */
function splitChain(
  text: string,
): Array<{ raw: string; link?: (typeof LINKS)[number]; label: string | null }> {
  const parts: Array<{ raw: string; link?: (typeof LINKS)[number]; label: string | null }> = [];
  let rest = text;

  for (;;) {
    let best: { index: number; link: (typeof LINKS)[number]; length: number } | null = null;
    for (const link of LINKS) {
      const match = link.re.exec(rest);
      if (!match) continue;
      if (!best || match.index < best.index) {
        best = { index: match.index, link, length: match[0].length };
      }
    }
    if (!best) {
      parts.push({ raw: rest, label: null });
      return parts;
    }

    const head = rest.slice(0, best.index);
    let tail = rest.slice(best.index + best.length);

    let label: string | null = null;
    const labelled = /^\s*\|([\s\S]*?)\|/.exec(tail);
    if (labelled) {
      label = labelled[1].trim();
      tail = tail.slice(labelled[0].length);
    }

    parts.push({ raw: head, link: best.link, label });
    rest = tail;
  }
}

function parseNode(raw: string, line: number): DiagramNode {
  const text = raw.trim();
  if (!text) throw new DiagramSyntaxError('empty node', line);

  const match = NODE_RE.exec(text);
  if (!match) throw new DiagramSyntaxError(`cannot read node "${text}"`, line);

  const [, id, open, label] = match;
  if (!open) return { id, label: id, shape: 'rect' };

  const shape = SHAPES[open];
  if (!shape) throw new DiagramSyntaxError(`unknown node shape "${open}"`, line);
  return { id, label: unquote(label ?? ''), shape };
}

function unquote(label: string): string {
  const trimmed = label.trim();
  if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * A practical subset of Mermaid's flowchart syntax — the shapes and links a
 * report actually uses. Agents already write this dialect fluently, which is
 * the whole reason to borrow it rather than invent one; the renderer is ours,
 * so the output follows the document's theme instead of Mermaid's.
 */
export function parseDiagram(source: string): Diagram {
  const lines = source.split('\n');
  let direction: Direction = 'TD';
  let sawHeader = false;

  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];

  const remember = (node: DiagramNode) => {
    const existing = nodes.get(node.id);
    // A later mention without a label must not blank out the declared one:
    // `A[Start] --> B` then `B --> A` is ordinary.
    if (!existing || (existing.label === existing.id && node.label !== node.id)) {
      nodes.set(node.id, node);
    }
    return node.id;
  };

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = stripComment(rawLine).trim();
    if (!line) return;

    if (!sawHeader) {
      const header = HEADER_RE.exec(line);
      if (header) {
        direction = normalizeDirection(header[1]);
        sawHeader = true;
        return;
      }
    }

    const chain = splitChain(line);
    if (chain.length === 1) {
      remember(parseNode(chain[0].raw, lineNumber));
      return;
    }

    for (let i = 0; i < chain.length - 1; i += 1) {
      const left = chain[i];
      const right = chain[i + 1];
      const from = remember(parseNode(left.raw, lineNumber));
      const to = remember(parseNode(right.raw, lineNumber));
      const link = left.link;
      if (!link) throw new DiagramSyntaxError('malformed link', lineNumber);
      edges.push({ from, to, label: left.label, style: link.style, arrow: link.arrow });
    }
  });

  if (nodes.size === 0) throw new DiagramSyntaxError('diagram has no nodes', 1);
  return { direction, nodes: [...nodes.values()], edges };
}
