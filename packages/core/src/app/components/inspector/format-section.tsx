import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  CaseSensitive,
  ChevronDown,
  Italic,
  Link2,
  Lock,
  type LucideIcon,
  MoveHorizontal,
  MoveVertical,
  Type,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { type Translate, useT } from '../../lib/i18n';
import {
  isValidStyleValue,
  PROP_TOKENS,
  rgbToHex,
  type StyleChanges,
  type StyleInfo,
  type StyleOrigin,
  type StyleProp,
  type StyleValue,
  TOKENS,
  tokenOf,
  tokenValue,
} from '../../lib/inspector/format';
import { ColorField, NumberField, Section } from '../panel/fields';

/** What a key reads as right now: an unsaved change first, then the source, else inherited. */
type Current = { origin: StyleOrigin | null; pending: boolean };

function currentOf(prop: StyleProp, info: StyleInfo | null, pending: StyleChanges): Current {
  if (prop in pending) {
    const value = pending[prop];
    if (value === null || value === undefined) return { origin: null, pending: true };
    const token = typeof value === 'string' ? tokenOf(value) : null;
    return {
      origin: token ? { kind: 'token', token } : { kind: 'literal', value },
      pending: true,
    };
  }
  return { origin: info?.props?.[prop] ?? null, pending: false };
}

/** Where a value comes from, for a tooltip: a shared style object, or code the panel only shows. */
function originNote(t: Translate, current: Current): string | undefined {
  const origin = current.origin;
  if (current.pending || !origin) return undefined;
  const from = origin.from ? t('from {name}', { name: origin.from }) : null;
  const code = origin.kind === 'code' ? t('set in code: {code}', { code: origin.code }) : null;
  return [code, from].filter(Boolean).join(' · ') || undefined;
}

// One frame for a composite control, so a number and its token chip read as
// one field, as they are one value.
const BOX_CLASS =
  'flex h-8 min-w-0 items-center rounded border border-border transition-colors focus-within:border-foreground/40';

const SELECT_CLASS =
  'h-8 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-6 text-xs outline-none';

const SEGMENT_CLASS =
  'flex h-8 min-w-8 flex-1 items-center justify-center rounded-[3px] text-foreground/70 transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/60 aria-pressed:bg-accent aria-pressed:text-foreground';

// Named with the number, as one string: "Light" alone is already the theme's.
const WEIGHTS: Array<[number, string]> = [
  [300, 'Light 300'],
  [400, 'Regular 400'],
  [500, 'Medium 500'],
  [600, 'Semibold 600'],
  [700, 'Bold 700'],
  [800, 'Extrabold 800'],
];

const ALIGNS: Array<[string, string, LucideIcon]> = [
  ['left', 'Align left', AlignLeft],
  ['center', 'Align center', AlignCenter],
  ['right', 'Align right', AlignRight],
  ['justify', 'Justify', AlignJustify],
];

type Choice = 'inherit' | `token:${string}` | 'custom';

function choiceOf(prop: StyleProp, current: Current): Choice {
  const origin = current.origin;
  if (origin === null || (origin.from && !current.pending)) return 'inherit';
  const group = PROP_TOKENS[prop];
  if (origin.kind === 'token' && group && TOKENS[group].some((t) => t.token === origin.token)) {
    return `token:${origin.token}`;
  }
  return 'custom';
}

/**
 * The value's source as a choice — inherited, one of the document's tokens,
 * or this element's own. The chip names it, so a field linked to the design
 * panel says so without being opened; the native select under it does the
 * choosing, and the keyboard and screen reader with it.
 */
function TokenChip({
  label,
  prop,
  current,
  compact = false,
  onPick,
}: {
  label: string;
  prop: StyleProp;
  current: Current;
  /**
   * Only an icon, for a field too narrow for a token name; `linked` keeps the
   * name while a token is chosen, since that is the one worth reading.
   */
  compact?: boolean | 'linked';
  onPick: (value: 'inherit' | string) => void;
}) {
  const t = useT();
  const group = PROP_TOKENS[prop];
  const tokens = group ? TOKENS[group] : [];
  const choice = choiceOf(prop, current);
  const origin = current.origin;
  const linked = choice.startsWith('token:');
  const inheritLabel =
    origin?.from && !current.pending ? t('From {name}', { name: origin.from }) : t('Inherited');
  const shown =
    choice === 'inherit'
      ? origin?.from && !current.pending
        ? origin.from
        : t('Inherited')
      : choice === 'custom'
        ? origin?.kind === 'code'
          ? t('Code')
          : t('Custom')
        : t(tokens.find((entry) => `token:${entry.token}` === choice)?.label ?? 'Custom');
  return (
    <span
      title={originNote(t, current) ?? (linked ? `--od-${choice.slice(6)}` : undefined)}
      className={`relative mr-1 flex h-6 flex-none items-center gap-0.5 rounded px-1.5 text-[11px] transition-colors hover:bg-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-foreground/60 ${
        linked ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
      }`}
    >
      {compact === true || (compact === 'linked' && !linked) ? (
        <Link2 aria-hidden className="size-3.5" />
      ) : (
        <span className="max-w-20 truncate">{shown}</span>
      )}
      <ChevronDown aria-hidden className="size-3 opacity-60" />
      <select
        aria-label={t('{label} token', { label })}
        value={choice}
        onChange={(e) => {
          const next = e.target.value;
          if (next === 'inherit') onPick('inherit');
          else if (next.startsWith('token:')) onPick(tokenValue(next.slice(6)));
        }}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        <option value="inherit">{inheritLabel}</option>
        {tokens.map((entry) => (
          <option key={entry.token} value={`token:${entry.token}`}>
            {t(entry.label)}
          </option>
        ))}
        {choice === 'custom' && <option value="custom">{t('Custom')}</option>}
      </select>
    </span>
  );
}

function Segments({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset
      aria-label={label}
      className="m-0 flex h-9 min-w-0 items-center gap-0.5 rounded border border-border p-0.5"
    >
      {children}
    </fieldset>
  );
}

export type FormatSectionProps = {
  anchor: HTMLElement;
  /** `null` while the source is still being read. */
  info: StyleInfo | null;
  pending: StyleChanges;
  onChange: (prop: StyleProp, value: StyleValue | undefined, shown: StyleOrigin | null) => void;
};

/**
 * Typography and colour for the selected element, written into its `style` in
 * source. Values are read from the rendered element, so what the fields show
 * is what is printed; whether a value is a design token, a shared style
 * object's, or code comes from the source.
 */
export function FormatSection({ anchor, info, pending, onChange }: FormatSectionProps) {
  const t = useT();
  const editable = info?.editable === true;
  const cs = getComputedStyle(anchor);
  const current = (prop: StyleProp) => currentOf(prop, info, pending);
  const set = (prop: StyleProp, value: StyleValue | undefined) => {
    if (value !== undefined && !isValidStyleValue(prop, value)) return;
    onChange(prop, value, info?.props?.[prop] ?? null);
  };
  // Off in source when the element writes the key itself; otherwise only the
  // unsaved change is taken back, since an inherited key is not this element's.
  const clear = (prop: StyleProp) => {
    const origin = info?.props?.[prop];
    set(prop, origin && !origin.from ? null : undefined);
  };
  const pick = (prop: StyleProp) => (value: 'inherit' | string) =>
    value === 'inherit' ? clear(prop) : set(prop, value);

  const fontSize = Number.parseFloat(cs.fontSize) || 0;
  const weight = Number.parseInt(cs.fontWeight, 10) || 400;
  const italic = cs.fontStyle === 'italic';
  const align = cs.textAlign === 'start' ? 'left' : cs.textAlign === 'end' ? 'right' : cs.textAlign;
  const lineHeight =
    cs.lineHeight === 'normal' || fontSize === 0
      ? 1.2
      : Number((Number.parseFloat(cs.lineHeight) / fontSize).toFixed(2));
  const tracking = cs.letterSpacing === 'normal' ? 0 : Number.parseFloat(cs.letterSpacing) || 0;
  const color = rgbToHex(cs.color) ?? '';
  const background = rgbToHex(cs.backgroundColor) ?? '';

  // A refused element keeps its fields, read-only: they still say what the
  // element is set to, and the lock says why they do not move.
  const locked = info !== null && !editable ? t(info.reason) : null;
  const lock = locked ? (
    <span role="img" aria-label={locked} title={locked} className="flex text-muted-foreground">
      <Lock className="size-3.5" />
    </span>
  ) : undefined;

  const font = current('fontFamily');
  const fontChoice = choiceOf('fontFamily', font);

  return (
    <fieldset
      disabled={!editable}
      className={`m-0 min-w-0 border-0 p-0 transition-opacity ${locked ? 'opacity-50' : ''}`}
    >
      <Section title={t('Typography')} action={lock}>
        <label className={`${BOX_CLASS} relative`} title={originNote(t, font)}>
          <Type aria-hidden className="ml-2 size-3.5 flex-none text-muted-foreground" />
          <select
            aria-label={t('Font')}
            value={fontChoice}
            onChange={(e) => pick('fontFamily')(e.target.value)}
            className={`${SELECT_CLASS} pl-2`}
          >
            <option value="inherit">
              {font.origin?.from && !font.pending
                ? t('From {name}', { name: font.origin.from })
                : t('Inherited font')}
            </option>
            {TOKENS.font.map((entry) => (
              <option key={entry.token} value={`token:${entry.token}`}>
                {t('{name} font', { name: t(entry.label) })}
              </option>
            ))}
            {fontChoice === 'custom' && <option value="custom">{t('Custom font')}</option>}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
          />
        </label>

        <div className={BOX_CLASS} title={originNote(t, current('fontSize'))}>
          <NumberField
            bare
            label={t('Size in pixels')}
            prefix={<CaseSensitive className="size-4" />}
            value={Number(fontSize.toFixed(1))}
            min={4}
            max={400}
            step={0.5}
            suffix="px"
            onChange={(value) => set('fontSize', `${value}px`)}
          />
          <TokenChip
            label={t('Size')}
            prop="fontSize"
            current={current('fontSize')}
            onPick={pick('fontSize')}
          />
        </div>

        <div className="flex min-w-0 gap-2">
          <label
            className={`${BOX_CLASS} relative flex-1`}
            title={originNote(t, current('fontWeight'))}
          >
            <select
              aria-label={t('Weight')}
              value={weight}
              onChange={(e) => set('fontWeight', Number(e.target.value))}
              className={`${SELECT_CLASS} pl-2`}
            >
              {WEIGHTS.some(([value]) => value === weight) ? null : (
                <option value={weight}>{weight}</option>
              )}
              {WEIGHTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {t(label)}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute right-2 size-3.5 text-muted-foreground"
            />
          </label>
          <Segments label={t('Emphasis')}>
            <button
              type="button"
              aria-label={t('Bold')}
              title={t('Bold')}
              aria-pressed={weight >= 600}
              onClick={() => set('fontWeight', weight >= 600 ? 400 : 700)}
              className={SEGMENT_CLASS}
            >
              <Bold className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label={t('Italic')}
              title={t('Italic')}
              aria-pressed={italic}
              onClick={() => set('fontStyle', italic ? 'normal' : 'italic')}
              className={SEGMENT_CLASS}
            >
              <Italic className="size-3.5" />
            </button>
          </Segments>
        </div>

        <Segments label={t('Alignment')}>
          {ALIGNS.map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-label={t(label)}
              title={t(label)}
              aria-pressed={align === value}
              onClick={() => set('textAlign', value)}
              className={SEGMENT_CLASS}
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </Segments>

        <div className="grid grid-cols-2 gap-2">
          <div
            className={BOX_CLASS}
            title={originNote(t, current('lineHeight')) ?? t('Line height')}
          >
            <NumberField
              bare
              label={t('Line height')}
              prefix={<MoveVertical className="size-3.5" />}
              value={lineHeight}
              min={0.5}
              max={4}
              step={0.05}
              onChange={(value) => set('lineHeight', value)}
            />
            <TokenChip
              compact
              label={t('Line height')}
              prop="lineHeight"
              current={current('lineHeight')}
              onPick={pick('lineHeight')}
            />
          </div>
          <div
            className={BOX_CLASS}
            title={originNote(t, current('letterSpacing')) ?? t('Letter spacing')}
          >
            <NumberField
              bare
              label={t('Letter spacing in pixels')}
              prefix={<MoveHorizontal className="size-3.5" />}
              value={Number(tracking.toFixed(2))}
              min={-20}
              max={50}
              step={0.1}
              suffix="px"
              onChange={(value) => set('letterSpacing', `${value}px`)}
            />
          </div>
        </div>
      </Section>

      <Section title={t('Color')} action={lock}>
        <ColorField
          label={t('Text')}
          value={color}
          onChange={(value) => set('color', value)}
          trailing={
            <TokenChip
              compact="linked"
              label={t('Text color')}
              prop="color"
              current={current('color')}
              onPick={pick('color')}
            />
          }
        />
        <ColorField
          label={t('Fill')}
          value={background}
          placeholder={t('None')}
          onChange={(value) => set('background', value)}
          trailing={
            <TokenChip
              compact="linked"
              label={t('Fill')}
              prop="background"
              current={current('background')}
              onPick={pick('background')}
            />
          }
        />
      </Section>
    </fieldset>
  );
}
