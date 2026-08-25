'use client';

/**
 * Stage A: deterministic generation. No API call — the draft is built locally
 * from the archetype template, your goal, your requirements, and the stack.
 */

import { useMemo } from 'react';
import {
  buildDraft,
  sectionsDraftWouldFill,
  sectionsReplaceWouldOverwrite,
  type ApplyMode,
} from '@/lib/generate';
import { TEMPLATE_LIST, type ArchetypeId } from '@/lib/templates';
import { SECTION_BY_KEY, type PromptSections } from '@/lib/sections';
import { toTechStack, type StackSelection } from '@/lib/stack';
import type { TechStack } from '@/lib/render';
import { StackPicker, type PresetSummary } from './stack-picker';
import { Button, Chip, PaneTitle } from './ui';

export function GeneratePanel({
  archetype,
  onArchetype,
  goal,
  onGoal,
  requirements,
  onRequirements,
  stackSelection,
  onStackSelection,
  presets,
  onApplyPreset,
  current,
  onApply,
}: {
  archetype: ArchetypeId;
  onArchetype: (id: ArchetypeId) => void;
  goal: string;
  onGoal: (goal: string) => void;
  requirements: string[];
  onRequirements: (next: string[]) => void;
  stackSelection: StackSelection;
  onStackSelection: (next: StackSelection) => void;
  presets: PresetSummary[];
  onApplyPreset: (stack: TechStack) => void;
  current: PromptSections;
  onApply: (draft: PromptSections, mode: ApplyMode) => void;
}) {
  const draft = useMemo(
    () =>
      buildDraft({
        archetype,
        goal,
        requirements,
        stack: toTechStack(stackSelection),
      }),
    [archetype, goal, requirements, stackSelection],
  );

  const wouldFill = sectionsDraftWouldFill(current, draft.sections);
  const wouldOverwrite = sectionsReplaceWouldOverwrite(current, draft.sections);

  return (
    <>
      <PaneTitle
        right={
          <span className="font-mono text-[10px] text-[var(--color-faint)]">
            no API call
          </span>
        }
      >
        generate — stage a
      </PaneTitle>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
            archetype
          </label>
          <div className="flex flex-wrap gap-1">
            {TEMPLATE_LIST.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onArchetype(t.id)}
                title={t.blurb}
                className="border px-1.5 py-0.5 font-mono text-[10px] transition-colors"
                style={{
                  color:
                    archetype === t.id ? 'var(--color-accent)' : 'var(--color-muted)',
                  borderColor:
                    archetype === t.id ? 'var(--color-accent)' : 'var(--color-border)',
                  background:
                    archetype === t.id
                      ? 'color-mix(in srgb, var(--color-accent) 12%, transparent)'
                      : undefined,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--color-muted)]">
            {TEMPLATE_LIST.find((t) => t.id === archetype)?.blurb}
          </p>
        </div>

        <div className="border-b border-[var(--color-border)] px-3 py-2">
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
            goal
          </label>
          <input
            value={goal}
            onChange={(e) => onGoal(e.target.value)}
            placeholder="review pull requests for security issues"
            className="w-full border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 font-mono text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
          />
          <p className="mt-1 text-[10px] text-[var(--color-faint)]">
            Completes the sentence “Your job is to …”.
          </p>
        </div>

        <RequirementsInput values={requirements} onChange={onRequirements} />

        <StackPicker
          selection={stackSelection}
          onChange={onStackSelection}
          presets={presets}
          onApplyPreset={onApplyPreset}
        />
      </div>

      <div className="shrink-0 border-t border-[var(--color-border-strong)] bg-[var(--color-panel)] px-3 py-2">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] text-[var(--color-faint)]">
            would fill
          </span>
          {wouldFill.length === 0 ? (
            <span className="font-mono text-[10px] text-[var(--color-faint)]">
              nothing — every section it writes is already filled
            </span>
          ) : (
            wouldFill.map((key) => (
              <Chip key={key} color="var(--color-system)">
                {SECTION_BY_KEY[key].label}
              </Chip>
            ))
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="primary"
            disabled={wouldFill.length === 0}
            onClick={() => onApply(draft.sections, 'fill-empty')}
            title="Write only the sections you have left empty"
          >
            fill empty sections
          </Button>
          <Button
            onClick={() => onApply(draft.sections, 'replace')}
            title={
              wouldOverwrite.length > 0
                ? `Overwrites your text in: ${wouldOverwrite
                    .map((k) => SECTION_BY_KEY[k].label)
                    .join(', ')}`
                : 'Replace all sections with the draft'
            }
          >
            replace all
            {wouldOverwrite.length > 0 && (
              <span className="text-[var(--color-user)]">
                ({wouldOverwrite.length} overwritten)
              </span>
            )}
          </Button>
          <span className="ml-auto font-mono text-[10px] text-[var(--color-faint)]">
            not saved until ⌘S
          </span>
        </div>
      </div>
    </>
  );
}

function RequirementsInput({
  values,
  onChange,
}: {
  values: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="border-b border-[var(--color-border)] px-3 py-2">
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
        requirements
      </label>
      <div className="space-y-1">
        {values.map((value, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="pt-1 font-mono text-[10px] text-[var(--color-faint)]">
              {i + 1}.
            </span>
            <input
              value={value}
              onChange={(e) =>
                onChange(values.map((v, j) => (j === i ? e.target.value : v)))
              }
              placeholder="a specific rule this prompt must enforce"
              className="min-w-0 flex-1 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
            />
            <Button
              variant="ghost"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              ×
            </Button>
          </div>
        ))}
        <Button variant="ghost" onClick={() => onChange([...values, ''])}>
          + requirement
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-[var(--color-faint)]">
        Appended to the archetype&apos;s own rules, after them.
      </p>
    </div>
  );
}
