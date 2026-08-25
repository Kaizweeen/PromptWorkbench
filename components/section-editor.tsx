'use client';

/** The section editor: one block per canonical section, with its teaching hint. */

import { useState } from 'react';
import {
  SECTIONS,
  isSectionEmpty,
  type PromptSections,
  type SectionSpec,
} from '@/lib/sections';
import { Chip } from './ui';
import {
  DocumentsInput,
  ExamplesInput,
  RulesInput,
  TEXTAREA,
} from './section-inputs';

export function SectionEditor({
  sections,
  onChange,
}: {
  sections: PromptSections;
  onChange: (next: PromptSections) => void;
}) {
  function set<K extends keyof PromptSections>(key: K, value: PromptSections[K]) {
    onChange({ ...sections, [key]: value });
  }

  return (
    <div className="divide-y divide-[var(--color-border)]">
      {SECTIONS.map((spec) => (
        <SectionBlock
          key={spec.key}
          spec={spec}
          empty={isSectionEmpty(sections, spec.key)}
          sections={sections}
          set={set}
        />
      ))}
    </div>
  );
}

function SectionBlock({
  spec,
  empty,
  sections,
  set,
}: {
  spec: SectionSpec;
  empty: boolean;
  sections: PromptSections;
  set: <K extends keyof PromptSections>(key: K, value: PromptSections[K]) => void;
}) {
  // Hints are shown where they are useful — on sections you have not filled
  // in yet — and collapse once the section has content.
  const [showHint, setShowHint] = useState(empty);

  return (
    <div className="px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="w-4 font-mono text-[11px] text-[var(--color-faint)]">
          {spec.order}
        </span>
        <span
          className={
            empty ? 'text-[var(--color-faint)]' : 'font-medium text-[var(--color-text)]'
          }
        >
          {spec.label}
        </span>
        {spec.tag && (
          <code className="font-mono text-[10px] text-[var(--color-muted)]">
            &lt;{spec.tag}&gt;
          </code>
        )}
        {spec.optional && <Chip color="var(--color-faint)">optional</Chip>}
        <button
          type="button"
          onClick={() => setShowHint((v) => !v)}
          title="Why this section exists"
          className="ml-auto border border-[var(--color-border)] px-1.5 font-mono text-[10px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          ?
        </button>
        <Chip color={channelColor(spec.channel)}>{spec.channel}</Chip>
      </div>

      {showHint && (
        <p className="mb-2 border-l-2 border-[var(--color-border-strong)] pl-2 text-[11px] leading-relaxed text-[var(--color-muted)]">
          {spec.hint}
        </p>
      )}

      <SectionInput spec={spec} sections={sections} set={set} />
    </div>
  );
}

function SectionInput({
  spec,
  sections,
  set,
}: {
  spec: SectionSpec;
  sections: PromptSections;
  set: <K extends keyof PromptSections>(key: K, value: PromptSections[K]) => void;
}) {
  if (spec.kind === 'text') {
    return (
      <textarea
        rows={spec.key === 'task_context' || spec.key === 'immediate_task' ? 3 : 2}
        className={TEXTAREA}
        placeholder={spec.placeholder}
        value={sections[spec.key] as string}
        onChange={(e) => set(spec.key, e.target.value)}
      />
    );
  }

  if (spec.kind === 'rules') {
    return <RulesInput rules={sections.rules} set={(v) => set('rules', v)} spec={spec} />;
  }

  if (spec.kind === 'documents') {
    return (
      <DocumentsInput
        docs={sections.background}
        set={(v) => set('background', v)}
        spec={spec}
      />
    );
  }

  return (
    <ExamplesInput
      examples={sections.examples}
      set={(v) => set('examples', v)}
      spec={spec}
    />
  );
}

function channelColor(channel: string): string {
  if (channel === 'system') return 'var(--color-system)';
  if (channel === 'user') return 'var(--color-user)';
  return 'var(--color-prefill)';
}
