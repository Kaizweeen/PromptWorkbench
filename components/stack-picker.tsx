'use client';

/**
 * Tech stack checkbox grid. This is metadata about the *target* project the
 * generated prompt is for — not the stack of this app. It renders into the
 * prompt as a <tech_stack> block.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  STACK_CATEGORIES,
  countSelected,
  toTechStack,
  type StackSelection,
} from '@/lib/stack';
import { saveStackPresetAction, deleteStackPresetAction } from '@/app/actions';
import type { TechStack } from '@/lib/render';
import { Button } from './ui';

export interface PresetSummary {
  id: string;
  name: string;
  stack: TechStack;
}

export function StackPicker({
  selection,
  onChange,
  presets,
  onApplyPreset,
}: {
  selection: StackSelection;
  onChange: (next: StackSelection) => void;
  presets: PresetSummary[];
  onApplyPreset: (stack: TechStack) => void;
}) {
  const router = useRouter();
  const [presetName, setPresetName] = useState('');
  const [pending, startTransition] = useTransition();
  const total = countSelected(selection);

  function toggle(categoryId: string, option: string) {
    const current = selection[categoryId];
    const items = current.items.includes(option)
      ? current.items.filter((i) => i !== option)
      : [...current.items, option];
    onChange({ ...selection, [categoryId]: { ...current, items } });
  }

  function setOther(categoryId: string, other: string) {
    onChange({ ...selection, [categoryId]: { ...selection[categoryId], other } });
  }

  function savePreset() {
    if (presetName.trim() === '' || pending) return;
    startTransition(async () => {
      await saveStackPresetAction(presetName, toTechStack(selection));
      setPresetName('');
      router.refresh();
    });
  }

  function removePreset(id: string) {
    startTransition(async () => {
      await deleteStackPresetAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
          presets
        </span>
        {presets.map((preset) => (
          <span key={preset.id} className="flex items-center">
            <button
              type="button"
              onClick={() => onApplyPreset(preset.stack)}
              title="Apply this preset"
              className="border border-[var(--color-border-strong)] border-r-0 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              {preset.name}
            </button>
            <button
              type="button"
              onClick={() => removePreset(preset.id)}
              title="Delete preset"
              disabled={pending}
              className="border border-[var(--color-border-strong)] px-1 py-0.5 font-mono text-[10px] text-[var(--color-faint)] hover:text-[#f0757a]"
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && savePreset()}
          placeholder="save current as…"
          className="ml-auto w-36 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        <Button onClick={savePreset} disabled={presetName.trim() === '' || pending}>
          save
        </Button>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
          tech stack — target project
        </span>
        <span className="font-mono text-[10px] text-[var(--color-muted)]">
          {total} selected
        </span>
      </div>

      <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
        {STACK_CATEGORIES.map((category) => {
          const chosen = selection[category.id] ?? { items: [], other: '' };
          return (
            <div key={category.id} className="px-3 py-2">
              <div className="mb-1 text-[12px] text-[var(--color-text)]">
                {category.label}
              </div>
              <div className="flex flex-wrap gap-1">
                {category.options.map((option) => {
                  const active = chosen.items.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggle(category.id, option)}
                      className="border px-1.5 py-0.5 font-mono text-[10px] transition-colors"
                      style={{
                        color: active ? 'var(--color-accent)' : 'var(--color-muted)',
                        borderColor: active
                          ? 'var(--color-accent)'
                          : 'var(--color-border)',
                        background: active
                          ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                          : undefined,
                      }}
                    >
                      {option}
                    </button>
                  );
                })}
                <input
                  value={chosen.other}
                  onChange={(e) => setOther(category.id, e.target.value)}
                  placeholder="other…"
                  className="w-28 border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
