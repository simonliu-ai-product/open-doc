import { type LayoutOptions, layoutDiagram } from './layout.ts';
import { type Diagram, DiagramSyntaxError, parseDiagram } from './parse.ts';
import { type RenderOptions, renderDiagram } from './render.ts';

export type CompiledDiagram = {
  svg: string;
  width: number;
  height: number;
  /** The parsed graph, so a caller can inspect what was drawn without re-parsing. */
  source: Diagram;
};

export type CompileOptions = LayoutOptions & RenderOptions;

/** Mermaid-flavoured text in, themed SVG out. One call, no browser. */
export function compileDiagram(source: string, options: CompileOptions = {}): CompiledDiagram {
  const parsed = parseDiagram(source);
  const laidOut = layoutDiagram(parsed, options);
  return {
    svg: renderDiagram(laidOut, options),
    width: laidOut.width,
    height: laidOut.height,
    source: parsed,
  };
}

export type { LaidOutDiagram, LaidOutEdge, LaidOutNode, LayoutOptions } from './layout.ts';
export type { Diagram, DiagramEdge, DiagramNode, Direction, NodeShape } from './parse.ts';
export type { RenderOptions } from './render.ts';
export { DiagramSyntaxError, layoutDiagram, parseDiagram, renderDiagram };
