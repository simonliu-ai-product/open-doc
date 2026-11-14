import { Check, Cloud, KeyRound, Laptop, Loader2, RotateCw, Terminal } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  installProvider,
  refreshStatus,
  setProviderConsent,
  useAgentState,
  useAgentStatus,
} from '@/lib/agent/use-agent';
import { toast } from '@/lib/toast';
import { format, useLocale } from '@/lib/use-locale';
import { cn } from '@/lib/utils';
import type { AgentProviderId, AgentProviderStatus } from '../../../agent/types';
import { ProviderLogo } from './provider-logo';

const CLI_INSTALL: Partial<Record<AgentProviderId, string>> = {
  codex: 'npm install -g @openai/codex',
};

function needsCli(p: AgentProviderStatus): boolean {
  return p.auth === 'sdk' && !p.cliFound && !p.ready;
}

export function ConnectView({ onConnected }: { onConnected?: () => void } = {}) {
  const t = useLocale();
  const { status, loading, enabled } = useAgentStatus();
  const { installing, connectErrors } = useAgentState();
  const [checking, setChecking] = useState(false);
  const providers = status?.providers ?? [];
  const needCli = providers.length > 0 && providers.every(needsCli);
  const anyMissing = providers.some(needsCli);

  const checkAgain = async () => {
    setChecking(true);
    try {
      await refreshStatus();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div>
        <span className="eyebrow">{t.agent.title}</span>
        <h2 className="mt-1.5 font-heading text-[15px] font-semibold tracking-tight">
          {needCli ? t.agent.needCliTitle : t.agent.connectTitle}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
          {needCli ? t.agent.needCliDescription : t.agent.connectDescription}
        </p>
      </div>

      {loading ? (
        <p className="text-[12px] text-muted-foreground">{t.agent.statusLoading}…</p>
      ) : !enabled ? (
        <p className="text-[12px] text-muted-foreground">{t.agent.disabled}</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {providers.map((provider) =>
            provider.auth === 'api-key' ? (
              <ApiKeyCard key={provider.id} provider={provider} onConnected={onConnected} />
            ) : (
              <ProviderCard
                key={provider.id}
                provider={provider}
                packageManager={status?.packageManager ?? 'npm'}
                installing={installing === provider.id}
                busy={installing !== null}
                error={connectErrors[provider.id]}
                onConnect={async () => {
                  try {
                    await installProvider(provider.id);
                    toast.success(format(t.agent.toastConnected, { name: provider.name }));
                  } catch (err) {
                    toast.error(format(t.agent.toastConnectFailed, { pkg: provider.sdkPackage }), {
                      description: err instanceof Error ? err.message : undefined,
                    });
                  }
                }}
              />
            ),
          )}
          {anyMissing && (
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              disabled={checking}
              onClick={checkAgain}
            >
              <RotateCw
                className={cn('size-3.5', checking && 'animate-spin motion-reduce:animate-none')}
                aria-hidden
              />
              {t.agent.checkAgain}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  provider,
  packageManager,
  installing,
  busy,
  error,
  onConnect,
}: {
  provider: AgentProviderStatus;
  packageManager: string;
  installing: boolean;
  busy: boolean;
  error: string | undefined;
  onConnect: () => void;
}) {
  const t = useLocale();
  const missing = needsCli(provider);
  const cliLabel = provider.cliFound
    ? provider.cliVersion
      ? format(t.agent.cliFound, { version: provider.cliVersion })
      : t.agent.cliFoundNoVersion
    : t.agent.cliMissing;

  return (
    <div className="rounded-[8px] border border-border bg-card p-3 shadow-edge">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-heading text-[13px] font-semibold tracking-tight">
            <ProviderLogo provider={provider.id} className="size-3.5 shrink-0" />
            {provider.name}
          </h3>
          <p
            className={cn(
              'mt-0.5 flex items-center gap-1 text-[11px]',
              provider.cliFound ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            <Terminal className="size-3" aria-hidden />
            {cliLabel}
          </p>
        </div>
        {provider.ready ? (
          <span className="inline-flex items-center gap-1 rounded-[5px] bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-3" aria-hidden />
            {t.agent.connected}
          </span>
        ) : installing ? (
          <span className="inline-flex items-center gap-1.5 px-1 text-[11.5px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
            {t.agent.connecting}
          </span>
        ) : missing ? null : (
          <Button
            size="sm"
            variant={error ? 'outline' : 'default'}
            disabled={busy}
            onClick={onConnect}
          >
            {error ? t.agent.retry : t.agent.connect}
          </Button>
        )}
      </div>
      {missing ? (
        <div className="mt-2.5 flex flex-col gap-1.5">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {format(t.agent.cliHint, { name: provider.name })}
          </p>
          <code className="block overflow-x-auto rounded-[5px] bg-muted px-2 py-1.5 font-mono text-[11px] whitespace-nowrap select-all">
            {CLI_INSTALL[provider.id]}
          </code>
        </div>
      ) : error && !installing ? (
        <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-destructive">{error}</p>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {provider.ready
            ? `${provider.sdkPackage} v${provider.sdkVersion}`
            : format(t.agent.connectInstallHint, { pkg: provider.sdkPackage, pm: packageManager })}
        </p>
      )}
    </div>
  );
}

export function PreviewBadge({ className }: { className?: string }) {
  const t = useLocale();
  return (
    <span
      title={t.agent.previewHint}
      className={cn(
        'inline-flex shrink-0 items-center rounded-[4px] bg-amber-500/12 px-1.5 py-px text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400',
        className,
      )}
    >
      {t.agent.preview}
    </span>
  );
}

const TERM_KEYS = [
  'preview',
  'local',
  'upload',
  'billing',
  'writeBack',
  'auth',
  'withdraw',
] as const;

/**
 * The terms an agent needs accepted, and the setup accepting them starts. It
 * settles only once local mode is ready, so the first turn after it never runs
 * in the cloud by accident. The checkbox and button stay pinned at the bottom
 * of the nearest scroll container while the terms scroll under them.
 */
export function ProviderConsent({
  provider,
  onDone,
  onCancel,
}: {
  provider: AgentProviderStatus;
  onDone?: () => void;
  onCancel: () => void;
}) {
  const t = useLocale();
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'preparing'>('idle');
  const consent = provider.consent;
  if (!consent) return null;
  const runtime = provider.runtime;
  const busy = phase !== 'idle';

  const accept = async () => {
    setPhase('saving');
    try {
      await setProviderConsent(provider.id, consent.version, true);
    } catch (err) {
      setPhase('idle');
      toast.error(t.agent.toastTermsFailed, {
        description: err instanceof Error ? err.message : undefined,
      });
      return;
    }
    if (runtime?.mode === 'cloud' && runtime.localSupported) {
      setPhase('preparing');
      try {
        await installProvider(provider.id);
      } catch (err) {
        toast.error(t.agent.toastLocalFailed, {
          description: err instanceof Error ? err.message : undefined,
        });
      }
    }
    toast.success(format(t.agent.toastConnected, { name: provider.name }));
    onDone?.();
  };

  return (
    <div className="flex flex-col gap-2.5" data-agent-terms>
      <div>
        <h4 className="font-heading text-[12.5px] font-semibold tracking-tight">
          {format(t.agent.termsTitle, { name: provider.name })}
        </h4>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          {format(t.agent.termsIntro, { name: provider.name })}
        </p>
      </div>
      <ol className="flex list-decimal flex-col gap-1.5 pl-4 text-[11.5px] leading-relaxed">
        {TERM_KEYS.map((key) => (
          <li key={key}>{t.agent.terms[key]}</li>
        ))}
      </ol>
      <div className="sticky bottom-0 -mx-3 -mb-3 flex flex-col gap-2 rounded-b-[8px] border-t border-border bg-card px-3 py-2.5">
        <label className="flex cursor-pointer items-start gap-2 text-[11.5px] font-medium">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={agreed}
            disabled={busy}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          {t.agent.termsAgree}
        </label>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!agreed || busy} onClick={accept}>
            {busy && (
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
            )}
            {phase === 'preparing' ? `${t.agent.runtimeEnabling}…` : t.agent.termsAccept}
          </Button>
          {!busy && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              {t.agent.cancelEdit}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ApiKeyCard({
  provider,
  onConnected,
}: {
  provider: AgentProviderStatus;
  onConnected?: () => void;
}) {
  const t = useLocale();
  const [reading, setReading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const { installing } = useAgentState();
  const consent = provider.consent;
  const accepted = consent?.accepted ?? true;
  const runtime = provider.runtime;
  const settingUp = installing === provider.id;
  const canGoLocal = runtime?.mode === 'cloud' && runtime.localSupported;

  const goLocal = async () => {
    try {
      await installProvider(provider.id);
    } catch (err) {
      toast.error(t.agent.toastLocalFailed, {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  const withdraw = async () => {
    if (!consent) return;
    setWithdrawing(true);
    try {
      await setProviderConsent(provider.id, consent.version, false);
    } catch (err) {
      toast.error(t.agent.toastTermsFailed, {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div
      data-agent-provider-card={provider.id}
      className="rounded-[8px] border border-border bg-card p-3 shadow-edge"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-heading text-[13px] font-semibold tracking-tight">
            <ProviderLogo provider={provider.id} className="size-3.5 shrink-0" />
            {provider.name}
            {provider.preview && <PreviewBadge />}
          </h3>
          <p
            className={cn(
              'mt-0.5 flex items-center gap-1 text-[11px]',
              provider.keyFound ? 'text-muted-foreground' : 'text-amber-600 dark:text-amber-400',
            )}
          >
            <KeyRound className="size-3" aria-hidden />
            {provider.keyFound ? t.agent.keyFound : t.agent.keyMissing}
          </p>
        </div>
        {provider.ready && !settingUp ? (
          <span className="inline-flex items-center gap-1 rounded-[5px] bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-3" aria-hidden />
            {t.agent.connected}
          </span>
        ) : !accepted && !reading && provider.keyFound ? (
          <Button size="sm" onClick={() => setReading(true)}>
            {t.agent.termsReview}
          </Button>
        ) : null}
      </div>

      {!provider.keyFound && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t.agent.keyHint}</p>
      )}

      {reading && (
        <div className="mt-3 border-t border-border pt-3">
          <ProviderConsent
            provider={provider}
            onCancel={() => setReading(false)}
            onDone={() => {
              setReading(false);
              onConnected?.();
            }}
          />
        </div>
      )}

      {runtime && accepted && !reading && (
        <div className="mt-2 flex flex-col gap-1.5" data-agent-runtime={runtime.mode}>
          {settingUp ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden />
              {t.agent.runtimeEnabling}…
            </span>
          ) : (
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              {runtime.mode === 'local' ? (
                <Laptop className="size-3" aria-hidden />
              ) : (
                <Cloud className="size-3" aria-hidden />
              )}
              {runtime.mode === 'local' ? t.agent.runtimeLocal : t.agent.runtimeCloud}
            </p>
          )}
          {!settingUp && canGoLocal ? (
            <div className="flex flex-col items-start gap-1">
              <Button size="xs" variant="outline" onClick={goLocal}>
                {t.agent.runtimeEnable}
              </Button>
              <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                {t.agent.runtimeHint}
              </p>
            </div>
          ) : runtime.mode === 'cloud' && !runtime.localSupported ? (
            <p className="text-[10.5px] text-muted-foreground">{t.agent.runtimeUnsupported}</p>
          ) : null}
        </div>
      )}

      {consent?.accepted && (
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{format(t.agent.termsAccepted, { version: consent.version })}</span>
          <button
            type="button"
            className="underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            disabled={withdrawing || settingUp}
            onClick={withdraw}
          >
            {t.agent.termsWithdraw}
          </button>
        </div>
      )}
    </div>
  );
}
