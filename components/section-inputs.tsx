'use client';

/** Collection inputs for the sections that hold lists rather than free text. */

import type { DocumentEntry, ExamplePair, SectionSpec } from '@/lib/sections';
import { Button } from './ui';

export const TEXTAREA =
  'w-full resize-y border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 font-mono text-[12px] leading-relaxed text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]';

export function RulesInput({
  rules,
  set,
  spec,
}: {
  rules: string[];
  set: (v: string[]) => void;
  spec: SectionSpec;
}) {
  return (
    <div className="space-y-1">
      {rules.map((rule, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="pt-1.5 font-mono text-[11px] text-[var(--color-faint)]">
            {i + 1}.
          </span>
          <textarea
            rows={1}
            className={TEXTAREA}
            placeholder={spec.placeholder}
            value={rule}
            onChange={(e) => set(rules.map((r, j) => (j === i ? e.target.value : r)))}
          />
          <Button
            variant="ghost"
            title="Remove rule"
            onClick={() => set(rules.filter((_, j) => j !== i))}
          >
            ×
          </Button>
        </div>
      ))}
      <Button variant="ghost" onClick={() => set([...rules, ''])}>
        + rule
      </Button>
    </div>
  );
}

export function DocumentsInput({
  docs,
  set,
  spec,
}: {
  docs: DocumentEntry[];
  set: (v: DocumentEntry[]) => void;
  spec: SectionSpec;
}) {
  function update(i: number, patch: Partial<DocumentEntry>) {
    set(docs.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }

  return (
    <div className="space-y-2">
      {docs.map((doc, i) => (
        <div key={i} className="border border-[var(--color-border)] p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <span className="font-mono text-[10px] text-[var(--color-faint)]">
              [{i + 1}]
            </span>
            <input
              className="flex-1 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 font-mono text-[11px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              placeholder="source title, e.g. schema.sql"
              value={doc.title}
              onChange={(e) => update(i, { title: e.target.value })}
            />
            <Button
              variant="ghost"
              title="Remove document"
              onClick={() => set(docs.filter((_, j) => j !== i))}
            >
              ×
            </Button>
          </div>
          <textarea
            rows={4}
            className={TEXTAREA}
            placeholder={spec.placeholder}
            value={doc.content}
            onChange={(e) => update(i, { content: e.target.value })}
          />
        </div>
      ))}
      <Button variant="ghost" onClick={() => set([...docs, { title: '', content: '' }])}>
        + document
      </Button>
    </div>
  );
}

export function ExamplesInput({
  examples,
  set,
  spec,
}: {
  examples: ExamplePair[];
  set: (v: ExamplePair[]) => void;
  spec: SectionSpec;
}) {
  function update(i: number, patch: Partial<ExamplePair>) {
    set(examples.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  }

  return (
    <div className="space-y-2">
      {examples.map((ex, i) => (
        <div key={i} className="border border-[var(--color-border)] p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-[10px] text-[var(--color-faint)]">
              &lt;example {i + 1}&gt;
            </span>
            <Button
              variant="ghost"
              title="Remove example"
              onClick={() => set(examples.filter((_, j) => j !== i))}
            >
              ×
            </Button>
          </div>
          <label className="mb-0.5 block font-mono text-[10px] text-[var(--color-muted)]">
            input
          </label>
          <textarea
            rows={2}
            className={`${TEXTAREA} mb-1.5`}
            placeholder={spec.placeholder}
            value={ex.input}
            onChange={(e) => update(i, { input: e.target.value })}
          />
          <label className="mb-0.5 block font-mono text-[10px] text-[var(--color-muted)]">
            output
          </label>
          <textarea
            rows={2}
            className={TEXTAREA}
            placeholder="exactly the output you want back"
            value={ex.output}
            onChange={(e) => update(i, { output: e.target.value })}
          />
        </div>
      ))}
      <Button
        variant="ghost"
        onClick={() => set([...examples, { input: '', output: '' }])}
      >
        + example
      </Button>
    </div>
  );
}
