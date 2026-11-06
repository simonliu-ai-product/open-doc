import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { ResizeHandle, useStoredWidth } from '@/components/panel/resize-handle';
import { Button } from '@/components/ui/button';
import { useAgentDock, useAgentStatus } from '@/lib/agent/use-agent';
import { useT } from '@/lib/i18n';
import { useLocale } from '@/lib/use-locale';
import { ProviderLogo } from './provider-logo';

export const AGENT_DOCK_W = 380;

export function AgentToggleButton() {
  const t = useLocale();
  const { open, toggle } = useAgentDock();
  const { provider } = useAgentStatus();
  if (import.meta.env.PROD) return null;
  return (
    <Button
      size="sm"
      variant={open ? 'default' : 'ghost'}
      onClick={toggle}
      aria-pressed={open}
      aria-label={t.agent.openTitle}
      title={t.agent.openTitle}
      data-agent-ui
    >
      {provider ? (
        <ProviderLogo provider={provider.id} className="size-3.5" />
      ) : (
        <Sparkles className="size-3.5" />
      )}
      <span className="hidden lg:inline">{t.agent.open}</span>
      <kbd className="ml-1 hidden rounded-[3px] bg-foreground/10 px-1 font-mono text-[9.5px] tracking-[0.04em] lg:inline">
        A
      </kbd>
    </Button>
  );
}

const AGENT_MIN_W = 300;
const AGENT_MAX_W = 720;

/**
 * The agent's column in the right dock: open-slide's width, resizable from its
 * left edge and remembered. The width never animates — the pages reflow on
 * every frame it would.
 */
export function AgentDockFrame({ children }: { children: ReactNode }) {
  const t = useT();
  const [width, setWidth] = useStoredWidth(
    'open-doc:agent-panel-width',
    AGENT_DOCK_W,
    AGENT_MIN_W,
    AGENT_MAX_W,
  );
  return (
    <div
      data-agent-dock
      className="relative flex h-full max-w-[60vw] shrink-0 border-border border-l bg-sidebar"
      style={{ width }}
    >
      <ResizeHandle
        width={width}
        min={AGENT_MIN_W}
        max={AGENT_MAX_W}
        defaultWidth={AGENT_DOCK_W}
        edge="left"
        label={t('Resize the agent panel')}
        onResize={setWidth}
        className="left-0 hidden md:block"
      />
      <div className="h-full min-w-0 flex-1">{children}</div>
    </div>
  );
}
