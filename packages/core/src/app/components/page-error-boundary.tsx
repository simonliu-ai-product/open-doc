import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useT } from '../lib/i18n';

type Labels = { title: string; hint: string };
type Props = { index: number; labels: Labels; children: ReactNode };
type State = { error: Error | null; children: ReactNode };

/**
 * A sheet whose document code throws while it renders. Without this, React
 * takes the whole viewer down with it — the rail, the toolbar, the agent
 * panel — and a save half-way through an edit (an agent's or the reader's:
 * the use before the import) leaves a blank window that no later save brings
 * back. Here the sheet says what broke, and the next reload of the document,
 * which brings new page content, tries it again.
 */
class Boundary extends Component<Props, State> {
  state: State = { error: null, children: this.props.children };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    // Page content is a new element only when the document reloaded.
    if (props.children !== state.children) return { error: null, children: props.children };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[open-doc] page ${this.props.index + 1} failed to render`, error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // Drawn on the paper, not in the chrome: plain colours, no theme tokens.
    return (
      <div
        role="alert"
        data-od-page-error=""
        style={{
          margin: 48,
          padding: '16px 18px',
          border: '1px solid #f1c4c0',
          borderRadius: 6,
          background: '#fdf3f2',
          color: '#7a271a',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        <div style={{ fontWeight: 600 }}>{this.props.labels.title}</div>
        <div
          data-od-page-error-message=""
          style={{
            marginTop: 6,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
          }}
        >
          {error.message}
        </div>
        <div style={{ marginTop: 8, color: '#9a4a3d', fontSize: 12 }}>{this.props.labels.hint}</div>
      </div>
    );
  }
}

export function PageErrorBoundary({ index, children }: { index: number; children?: ReactNode }) {
  const t = useT();
  return (
    <Boundary
      index={index}
      labels={{
        title: t('This page could not be drawn'),
        hint: t('It is drawn again as soon as the source is saved.'),
      }}
    >
      {children}
    </Boundary>
  );
}
