import { useState } from 'react';
import { useT } from '../../lib/i18n';
import type { FolderIcon } from '../../lib/sdk';
import { cn } from '../../lib/utils';

export const PRESET_COLORS = [
  '#e5484d',
  '#f76b15',
  '#ffb224',
  '#30a46c',
  '#12a594',
  '#0091ff',
  '#6e56cf',
  '#60646c',
];

// A curated set beats an emoji-picker dependency for a folder chip.
const PRESET_EMOJI = [
  '📁',
  '📄',
  '📊',
  '📈',
  '🧾',
  '🗂️',
  '📌',
  '⭐',
  '🏛️',
  '💼',
  '🧪',
  '⚙️',
  '🚀',
  '🔒',
  '💰',
  '🗓️',
];

export function IconPicker({
  value,
  onChange,
}: {
  value: FolderIcon;
  onChange: (icon: FolderIcon) => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<'emoji' | 'color'>(value.type);

  return (
    <div className="w-[232px]">
      <div className="mb-2 flex gap-1 rounded-md bg-muted p-0.5">
        {(['emoji', 'color'] as const).map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => setTab(next)}
            className={cn(
              'flex-1 rounded px-2 py-1 text-[11px] capitalize transition-colors',
              tab === next ? 'bg-background font-medium' : 'text-muted-foreground',
            )}
          >
            {t(next)}
          </button>
        ))}
      </div>

      {tab === 'emoji' ? (
        <div className="grid grid-cols-8 gap-1">
          {PRESET_EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onChange({ type: 'emoji', value: emoji })}
              className={cn(
                'grid size-6 place-items-center rounded text-[13px] transition-transform hover:scale-110',
                value.type === 'emoji' && value.value === emoji && 'bg-accent',
              )}
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-8 gap-1">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ type: 'color', value: color })}
              className={cn(
                'size-6 rounded ring-1 ring-black/10 transition-transform hover:scale-110',
                value.type === 'color' && value.value === color && 'ring-2 ring-foreground',
              )}
              style={{ background: color }}
              aria-label={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}
