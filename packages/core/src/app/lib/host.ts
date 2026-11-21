/**
 * The open-x host protocol, v1: what a host app (CoStaff Desktop, later the
 * VS Code extension) offers the viewer. Every member is optional, and with no
 * host the viewer behaves exactly as in a browser. The spec lives with the
 * desktop app (open-desktop/docs/HOST-PROTOCOL.md), which keeps the same types.
 */
export type HostCapability =
  | 'theme'
  | 'openItem'
  | 'openHome'
  | 'guardUnsaved'
  | 'printToPdf'
  | 'translucent';

export interface HostTheme {
  mode: 'light' | 'dark';
  accent: string | null;
}

export type UnsavedStatus = { drafts: boolean; pending: boolean };
export type UnsavedAction = 'save' | 'discard' | 'abandon';
export type UnsavedOutcome = { ok: true } | { ok: false; error: string };

export interface UnsavedGuard {
  status(): UnsavedStatus;
  settle(action: UnsavedAction): Promise<UnsavedOutcome>;
}

export interface OpenxHost {
  protocol: 1;
  name: string;
  capabilities: HostCapability[];
  theme?: {
    current(): HostTheme;
    onChange(listener: (theme: HostTheme) => void): () => void;
  };
  openItem?(item: { path: string; title?: string }): boolean;
  openHome?(path?: string): boolean;
  guardUnsaved?(guard: UnsavedGuard): () => void;
  printToPdf?(filename: string): Promise<boolean>;
  translucent?: boolean;
}

declare global {
  interface Window {
    openxHost?: OpenxHost;
  }
}

export function getHost(): OpenxHost | undefined {
  const host = typeof window === 'undefined' ? undefined : window.openxHost;
  return host?.protocol === 1 ? host : undefined;
}

export function hostCan(host: OpenxHost | undefined, capability: HostCapability): boolean {
  return Boolean(host?.capabilities?.includes(capability));
}

/**
 * The server path a click should hand to the host: a same-origin link to a
 * document other than the one shown. Null leaves the click to the viewer.
 */
export function documentPathForHost(href: string, current: string): string | null {
  const target = new URL(href, current);
  const here = new URL(current);
  if (target.origin !== here.origin) return null;
  const doc = /\/d\/([^/?#]+)/.exec(target.pathname);
  if (!doc) return null;
  const shownDoc = /\/d\/([^/?#]+)/.exec(here.pathname)?.[1];
  if (shownDoc === doc[1]) return null;
  return target.pathname + target.search;
}
