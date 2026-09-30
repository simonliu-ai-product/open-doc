import { Palette, RotateCcw, Shuffle, X } from 'lucide-react';
import type { DesignSystem } from '../../lib/design';
import { ColorField, FontField, type FontPreset, Section, SliderField } from '../panel/fields';
import { PanelBanner, PanelIconButton, PanelShell } from '../panel/panel-shell';
import { useDesignPanelState } from './design-provider';

const FONT_PRESETS: FontPreset[] = [
  {
    label: 'System sans',
    value: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif',
  },
  { label: 'Inter', value: '"Inter", system-ui, sans-serif' },
  { label: 'Helvetica', value: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { label: 'Georgia serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Times serif', value: '"Times New Roman", Times, serif' },
  { label: 'Mono', value: 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace' },
];

const PALETTE_KEYS: Array<{ key: keyof DesignSystem['palette']; label: string }> = [
  { key: 'bg', label: 'Sheet' },
  { key: 'text', label: 'Text' },
  { key: 'muted', label: 'Muted' },
  { key: 'accent', label: 'Accent' },
  { key: 'rule', label: 'Rule' },
];

const FONT_KEYS: Array<{ key: keyof DesignSystem['fonts']; label: string }> = [
  { key: 'heading', label: 'Heading' },
  { key: 'body', label: 'Body' },
  { key: 'mono', label: 'Mono' },
];

const TYPE_KEYS: Array<{
  key: keyof DesignSystem['typeScale'];
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'title', label: 'Title', min: 24, max: 72 },
  { key: 'h1', label: 'H1', min: 16, max: 48 },
  { key: 'h2', label: 'H2', min: 14, max: 36 },
  { key: 'h3', label: 'H3', min: 12, max: 28 },
  { key: 'body', label: 'Body', min: 9, max: 20 },
  { key: 'caption', label: 'Caption', min: 7, max: 16 },
];

/**
 * The document's design tokens, edited as a draft. Every change previews on
 * the pages at once and is one step in the view's undo history; saving and
 * discarding happen on the save card, with the page edits, so there is one
 * place that says what is unsaved.
 */
export function DesignPanel({ onClose }: { onClose: () => void }) {
  const { loaded, exists, warning, draft, dirty, update, resetToDefaults, shuffle } =
    useDesignPanelState();

  // The dock stays closed until there is a draft to show, rather than opening
  // on a spinner the reader has to wait out.
  if (!loaded || !draft) return null;

  return (
    <PanelShell
      label="Design"
      header={
        <>
          <Palette aria-hidden className="size-3.5 flex-none text-muted-foreground" />
          <span className="font-medium text-xs">Design</span>
          {!exists && (
            <span
              title="This document has no design const yet — saving writes one"
              className="rounded border border-border bg-muted px-1.5 py-px font-mono text-[9.5px] text-muted-foreground uppercase tracking-wider"
            >
              Draft
            </span>
          )}
          <span
            aria-hidden
            title={dirty ? 'Unsaved changes' : undefined}
            className={`size-1.5 rounded-full bg-foreground transition-opacity duration-150 ${dirty ? 'opacity-100' : 'opacity-0'}`}
          />
        </>
      }
      actions={
        <>
          <PanelIconButton label="Shuffle preset" onClick={shuffle}>
            <Shuffle className="size-3.5" />
          </PanelIconButton>
          <PanelIconButton label="Reset to defaults" onClick={resetToDefaults}>
            <RotateCcw className="size-3.5" />
          </PanelIconButton>
          <PanelIconButton label="Close design panel (D)" onClick={onClose}>
            <X className="size-3.5" />
          </PanelIconButton>
        </>
      }
      banner={warning ? <PanelBanner>{warning}</PanelBanner> : null}
    >
      <Section title="Palette">
        {PALETTE_KEYS.map(({ key, label }) => (
          <ColorField
            key={key}
            label={label}
            value={draft.palette[key]}
            onChange={(value) =>
              update((d) => {
                d.palette[key] = value;
              }, `palette.${key}`)
            }
          />
        ))}
      </Section>

      <Section title="Fonts">
        {FONT_KEYS.map(({ key, label }) => (
          <FontField
            key={key}
            label={label}
            value={draft.fonts[key]}
            presets={FONT_PRESETS}
            onChange={(value) =>
              update((d) => {
                d.fonts[key] = value;
              }, `fonts.${key}`)
            }
          />
        ))}
      </Section>

      <Section title="Type scale">
        {TYPE_KEYS.map(({ key, label, min, max }) => (
          <SliderField
            key={key}
            label={label}
            value={draft.typeScale[key]}
            min={min}
            max={max}
            suffix="px"
            onChange={(value) =>
              update((d) => {
                d.typeScale[key] = value;
              }, `typeScale.${key}`)
            }
          />
        ))}
        {draft.typeScale.body < 12 && (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Body under 12px prints below 9pt — hard to read on paper.
          </p>
        )}
      </Section>

      <Section title="Page">
        <SliderField
          label="Margin"
          value={draft.margin}
          min={32}
          max={140}
          step={2}
          suffix="px"
          onChange={(value) =>
            update((d) => {
              d.margin = value;
            }, 'margin')
          }
        />
        <SliderField
          label="Leading"
          value={draft.leading}
          min={1.2}
          max={2}
          step={0.05}
          onChange={(value) =>
            update((d) => {
              d.leading = Number(value.toFixed(2));
            }, 'leading')
          }
        />
        <SliderField
          label="Radius"
          value={draft.radius}
          min={0}
          max={24}
          suffix="px"
          onChange={(value) =>
            update((d) => {
              d.radius = value;
            }, 'radius')
          }
        />
      </Section>
    </PanelShell>
  );
}
