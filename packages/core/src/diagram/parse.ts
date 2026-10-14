export type Direction = 'TD' | 'LR';

export type NodeShape = 'rect' | 'round' | 'stadium' | 'diamond' | 'circle' | 'cylinder';

export type DiagramNode = {
  id: string;
  label: string;
  shape: NodeShape;
  subgraph?: string;
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

export type DiagramSubgraph = {
  id: string;
  label: string;
  nodeIds: string[];
};

export type SequenceParticipant = {
  id: string;
  label: string;
};

export type SequenceMessage = {
  from: string;
  to: string;
  label: string;
  style: EdgeStyle;
  arrow: boolean;
};

export type Diagram = {
  kind?: 'flowchart' | 'sequence';
  direction: Direction;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  subgraphs?: DiagramSubgraph[];
  participants?: SequenceParticipant[];
  messages?: SequenceMessage[];
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
const SEQ_HEADER_RE = /^sequenceDiagram$/i;
const SUBGRAPH_RE = /^subgraph\s+(?:([A-Za-z0-9_.-]+)\s*\[([\s\S]*?)\]|([\s\S]+))$/i;
const PARTICIPANT_RE = /^(?:participant|actor)\s+([A-Za-z0-9_.-]+)(?:\s+as\s+([\s\S]+))?$/i;
const SEQ_MSG_RE =
  /^([A-Za-z0-9_.-]+?)\s*(-->>|--\)|-->|->|->>|-\))\s*([+-]?[A-Za-z0-9_.-]+)\s*:\s*([\s\S]*)$/;

/** `A[Label]`, `A(Label)`, `A([Label])`, `A[(Label)]`, `A{Label}`, `A((Label))`, or a bare `A`. */
const NODE_RE =
  /^([A-Za-z0-9_.-]+)(?:(\(\(|\(\[|\[\(|\[|\(|\{)([\s\S]*?)(\)\)|\]\)|\)\]|\]|\)|\}))?$/;

const SHAPES: Record<string, NodeShape> = {
  '[': 'rect',
  '(': 'round',
  '([': 'stadium',
  '{': 'diamond',
  '((': 'circle',
  '[(': 'cylinder',
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

function parseSequence(lines: string[]): Diagram {
  const participants = new Map<string, SequenceParticipant>();
  const messages: SequenceMessage[] = [];

  const ensureParticipant = (id: string, label?: string) => {
    const cleanId = id.replace(/^[+-]/, '');
    const existing = participants.get(cleanId);
    if (!existing) {
      participants.set(cleanId, { id: cleanId, label: label ? unquote(label) : cleanId });
    } else if (label && existing.label === existing.id) {
      existing.label = unquote(label);
    }
    return cleanId;
  };

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = stripComment(rawLine).trim();
    if (!line || SEQ_HEADER_RE.test(line) || /^autonumber$/i.test(line)) return;

    const partMatch = PARTICIPANT_RE.exec(line);
    if (partMatch) {
      ensureParticipant(partMatch[1], partMatch[2]);
      return;
    }

    const msgMatch = SEQ_MSG_RE.exec(line);
    if (msgMatch) {
      const from = ensureParticipant(msgMatch[1]);
      const arrowToken = msgMatch[2];
      const to = ensureParticipant(msgMatch[3]);
      const label = msgMatch[4].trim();
      const dashed = arrowToken.startsWith('--');
      messages.push({
        from,
        to,
        label,
        style: dashed ? 'dashed' : 'solid',
        arrow: true,
      });
      return;
    }

    throw new DiagramSyntaxError(`cannot read sequence line "${line}"`, lineNumber);
  });

  if (participants.size === 0)
    throw new DiagramSyntaxError('sequence diagram has no participants', 1);

  const partList = [...participants.values()];
  return {
    kind: 'sequence',
    direction: 'LR',
    nodes: partList.map((p) => ({ id: p.id, label: p.label, shape: 'rect' })),
    edges: messages.map((m) => ({
      from: m.from,
      to: m.to,
      label: m.label || null,
      style: m.style,
      arrow: m.arrow,
    })),
    participants: partList,
    messages,
  };
}

/**
 * A practical subset of Mermaid's flowchart and sequenceDiagram syntax — the
 * shapes, subgraphs and links a report actually uses. Agents already write this
 * dialect fluently, which is the whole reason to borrow it rather than invent
 * one; the renderer is ours, so the output follows the document's theme instead
 * of Mermaid's.
 */
export function parseDiagram(source: string): Diagram {
  const lines = source.split('\n');
  const firstMeaningful = lines.map((l) => stripComment(l).trim()).find((l) => l.length > 0);

  if (firstMeaningful && SEQ_HEADER_RE.test(firstMeaningful)) {
    return parseSequence(lines);
  }

  let direction: Direction = 'TD';
  let sawHeader = false;

  const nodes = new Map<string, DiagramNode>();
  const edges: DiagramEdge[] = [];
  const subgraphs: DiagramSubgraph[] = [];
  const subgraphStack: DiagramSubgraph[] = [];

  const remember = (node: DiagramNode) => {
    const activeSubgraph = subgraphStack[subgraphStack.length - 1];
    const existing = nodes.get(node.id);
    // A later mention without a label must not blank out the declared one:
    // `A[Start] --> B` then `B --> A` is ordinary.
    if (!existing) {
      const created: DiagramNode = activeSubgraph ? { ...node, subgraph: activeSubgraph.id } : node;
      nodes.set(node.id, created);
    } else {
      if (existing.label === existing.id && node.label !== node.id) {
        existing.label = node.label;
        existing.shape = node.shape;
      }
      if (!existing.subgraph && activeSubgraph) {
        existing.subgraph = activeSubgraph.id;
      }
    }
    if (activeSubgraph && !activeSubgraph.nodeIds.includes(node.id)) {
      activeSubgraph.nodeIds.push(node.id);
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

    if (/^end$/i.test(line)) {
      subgraphStack.pop();
      return;
    }

    const subMatch = SUBGRAPH_RE.exec(line);
    if (subMatch) {
      const id = subMatch[1] ?? `sg-${subgraphs.length + 1}`;
      const label = unquote(subMatch[2] ?? subMatch[3] ?? id);
      const sg: DiagramSubgraph = { id, label, nodeIds: [] };
      subgraphs.push(sg);
      subgraphStack.push(sg);
      return;
    }

    if (/^direction\s+(?:TB|TD|BT|LR|RL)$/i.test(line)) {
      return;
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
  return {
    kind: 'flowchart',
    direction,
    nodes: [...nodes.values()],
    edges,
    ...(subgraphs.length > 0 ? { subgraphs } : {}),
  };
}
