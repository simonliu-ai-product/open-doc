import { ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { useT } from '../../lib/i18n';

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  /** A small control on the title's row, acting on the section as a whole. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border border-b px-3 py-3 last:border-b-0">
      <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
        <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** A section that starts closed: what is there for a second look, below what is used every time. */
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** Shown beside the title while closed, so the closed row still says something. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-border border-b last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center gap-2 px-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-2 focus-visible:outline-foreground/60 focus-visible:-outline-offset-2"
      >
        <h3 className="flex-none text-[10px] text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-muted-foreground/80">
          {!open && summary}
        </span>
        <ChevronRight
          aria-hidden
          className={`size-3.5 flex-none text-muted-foreground transition-transform duration-150 ease-out motion-reduce:transition-none ${
            open ? 'rotate-90' : ''
          }`}
        />
      </button>
      {open && (
        <div id={id} className="flex flex-col gap-2 px-3 pb-3">
          {children}
        </div>
      )}
    </section>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[64px_1fr] items-center gap-2">
      <label htmlFor={htmlFor} className="truncate text-[11px] text-muted-foreground">
        {label}
      </label>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

const INPUT_CLASS =
  'h-8 rounded border border-border bg-transparent px-2 text-xs outline-none focus:border-foreground/40 aria-invalid:border-foreground';

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/**
 * A swatch and its hex. Only a complete `#rrggbb` reaches the draft: anything
 * else would be written into the preview CSS, and saved, as whatever was typed
 * so far. A half-typed value goes back to the last good one when the field is
 * left.
 */
export function ColorField({
  label,
  value,
  placeholder,
  trailing,
  onChange,
}: {
  label: string;
  value: string;
  /** Sits after the hex, inside the row — the token picker in the element panel. */
  trailing?: ReactNode;
  /** Shown for an empty value, which then reads as unset rather than invalid. */
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = !HEX6.test(draft) && !(placeholder !== undefined && draft === value);

  return (
    <Field label={label} htmlFor={id}>
      <span className="relative inline-flex size-8 flex-none items-center justify-center rounded border border-border has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground/60">
        <span
          className="size-5 rounded-sm border border-border"
          style={{ background: value || 'transparent' }}
        />
        <input
          type="color"
          aria-label={t('{label} swatch', { label })}
          value={HEX6.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
      <input
        id={id}
        type="text"
        spellCheck={false}
        value={draft}
        placeholder={placeholder}
        aria-invalid={invalid}
        onChange={(e) => {
          const next = e.target.value.trim();
          setDraft(next);
          if (HEX6.test(next)) onChange(next.toLowerCase());
        }}
        onBlur={() => {
          if (!HEX6.test(draft)) setDraft(value);
        }}
        className={`${INPUT_CLASS} min-w-0 flex-1 font-mono uppercase tabular-nums placeholder:normal-case`}
      />
      {trailing}
    </Field>
  );
}

function decimalsOf(step: number): number {
  const text = String(step);
  return text.includes('.') ? (text.split('.')[1] as string).length : 0;
}

/**
 * A number typed or stepped with the arrow keys, kept inside its range and to
 * its step's precision. It commits on Enter or when the field is left, not on
 * every keystroke — typing `1` on the way to `14` would otherwise apply a
 * 1px heading for a moment.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  prefix,
  bare = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  /** An icon in front of the number, standing in for a visible label. */
  prefix?: ReactNode;
  /** No frame of its own: the field sits inside a composite control that draws one. */
  bare?: boolean;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const places = decimalsOf(step);
  const settle = (raw: number) => {
    const clamped = Math.min(max, Math.max(min, raw));
    return Number(clamped.toFixed(places));
  };
  const commit = () => {
    const parsed = Number.parseFloat(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = settle(parsed);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };

  return (
    <span className={bare ? 'relative min-w-0 flex-1' : 'relative flex-none'}>
      {prefix && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2 flex -translate-y-1/2 text-muted-foreground"
        >
          {prefix}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const next = settle(
              value + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1),
            );
            if (next !== value) onChange(next);
          }
        }}
        className={
          bare
            ? `h-8 w-full bg-transparent text-xs outline-none ${prefix ? 'pl-7' : 'pl-2'} ${suffix ? 'pr-7' : 'pr-1'} font-mono tabular-nums`
            : `${INPUT_CLASS} w-16 ${prefix ? 'pl-7' : ''} pr-6 text-right font-mono tabular-nums`
        }
      />
      {suffix && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-muted-foreground"
        >
          {suffix}
        </span>
      )}
    </span>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <Field label={label} htmlFor={id}>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 min-w-0 flex-1 cursor-pointer accent-foreground"
      />
      <NumberField
        label={label}
        value={value}
        min={min}
        max={max}
        step={step}
        suffix={suffix}
        onChange={onChange}
      />
    </Field>
  );
}

export type FontPreset = { label: string; value: string };

/** A preset, or "Custom" — shown only while the source holds a stack no preset matches. */
export function FontField({
  label,
  value,
  presets,
  onChange,
}: {
  label: string;
  value: string;
  presets: FontPreset[];
  onChange: (value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const matched = presets.find((preset) => preset.value === value);
  return (
    <Field label={label} htmlFor={id}>
      <select
        id={id}
        value={matched ? matched.value : '__custom__'}
        onChange={(e) => {
          if (e.target.value !== '__custom__') onChange(e.target.value);
        }}
        className={`${INPUT_CLASS} min-w-0 flex-1`}
      >
        {presets.map((preset) => (
          <option key={preset.label} value={preset.value}>
            {preset.label}
          </option>
        ))}
        {!matched && <option value="__custom__">{t('Custom (from source)')}</option>}
      </select>
    </Field>
  );
}
