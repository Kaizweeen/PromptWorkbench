'use client';

/**
 * Stage B: AI refine with per-section accept/reject.
 *
 * Nothing is applied until you accept it. Rejecting leaves your text exactly
 * as it was — refinement never silently overwrites the author.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { decodeEvents, type RunEvent } from '@/lib/api/events';
import { diffSections } from '@/lib/diff';
import { applyAccepted, proposedKeys, variableDrift } from '@/lib/refine';
import { SECTION_BY_KEY, type PromptSections, type SectionKey } from '@/lib/sections';
import type { TechStack } from '@/lib/render';
import { formatCost } from '@/lib/config';
import { DiffView } from './diff-view';
import { Button, Chip, Empty, PaneTitle } from './ui';
import { Notice } from './run-controls';

type Decision = 'pending' | 'accepted' | 'rejected';

export function RefinePanel({
  sections,
  stack,
  onApply,
}: {
  sections: PromptSections;
  stack: TechStack;
  onApply: (next: PromptSections) => void;
}) {
  const [proposal, setProposal] = useState<Partial<PromptSections> | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const keys = useMemo(
    () => (proposal ? proposedKeys(sections, proposal) : []),
    [proposal, sections],
  );

  const accepted = keys.filter((k) => decisions[k] === 'accepted');

  const drift = useMemo(() => {
    if (!proposal || accepted.length === 0) return { added: [], removed: [] };
    return variableDrift(sections, applyAccepted(sections, proposal, accepted));
  }, [proposal, sections, accepted]);

  const refine = useCallback(async () => {
    setProposal(null);
    setNotes([]);
    setDecisions({});
    setError(null);
    setCost(null);
    setReceived(0);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ sections, stack }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({ message: 'Refine failed.' }));
        setError(detail.message ?? 'Refine failed.');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = decodeEvents(buffer);
        buffer = rest;

        for (const event of events as RunEvent[]) {
          if (event.type === 'delta') setReceived((n) => n + event.text.length);
          else if (event.type === 'refined') {
            setProposal(event.sections);
            setNotes(event.notes);
          } else if (event.type === 'done') setCost(event.costUsd);
          else if (event.type === 'error') setError(event.message);
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }, [sections, stack]);

  function decide(key: SectionKey, decision: Decision) {
    setDecisions((prev) => ({ ...prev, [key]: decision }));
  }

  function applyAcceptedChanges() {
    if (!proposal) return;
    onApply(applyAccepted(sections, proposal, accepted));
    setProposal(null);
    setDecisions({});
    setNotes([]);
  }

  return (
    <>
      <PaneTitle
        right={
          <div className="flex items-center gap-1.5">
            {cost !== null && <Chip color="var(--color-muted)">{formatCost(cost)}</Chip>}
            {busy ? (
              <Button onClick={() => abortRef.current?.abort()}>stop</Button>
            ) : (
              <Button variant="primary" onClick={refine}>
                {proposal ? 'refine again' : 'refine'}
              </Button>
            )}
          </div>
        }
      >
        refine — stage b
      </PaneTitle>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {error && <Notice color="#f0757a">{error}</Notice>}

        {busy && (
          <p className="px-3 py-2 font-mono text-[10px] text-[var(--color-faint)]">
            reviewing the draft… {received} chars received
          </p>
        )}

        {!busy && !proposal && !error && (
          <Empty>
            Sends the draft to Claude to tighten wording, add missing edge
            cases, and flag ambiguity.
            <br />
            You accept or reject each section separately.
          </Empty>
        )}

        {notes.length > 0 && (
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-[var(--color-user)]">
              ambiguities flagged
            </div>
            <ul className="space-y-0.5">
              {notes.map((note, i) => (
                <li key={i} className="text-[11px] leading-relaxed text-[var(--color-muted)]">
                  — {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        {proposal && keys.length === 0 && (
          <Empty>Claude proposed no changes to this draft.</Empty>
        )}

        {proposal &&
          keys.map((key) => (
            <SectionProposal
              key={key}
              label={SECTION_BY_KEY[key].label}
              decision={decisions[key] ?? 'pending'}
              onDecide={(d) => decide(key, d)}
              current={sections}
              proposed={{ ...sections, [key]: proposal[key] }}
              sectionKey={key}
            />
          ))}
      </div>

      {proposal && keys.length > 0 && (
        <div className="shrink-0 border-t border-[var(--color-border-strong)] bg-[var(--color-panel)] px-3 py-2">
          {(drift.added.length > 0 || drift.removed.length > 0) && (
            <p className="mb-1.5 font-mono text-[10px] leading-relaxed text-[#f0757a]">
              Variable change in accepted sections:
              {drift.removed.length > 0 && ` removes ${drift.removed.map((v) => `{{${v}}}`).join(', ')}`}
              {drift.added.length > 0 && ` adds ${drift.added.map((v) => `{{${v}}}`).join(', ')}`}
              . Saved test cases reference these by name.
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <Button
              variant="primary"
              disabled={accepted.length === 0}
              onClick={applyAcceptedChanges}
            >
              apply {accepted.length} accepted
            </Button>
            <Button onClick={() => setDecisions(Object.fromEntries(keys.map((k) => [k, 'accepted'])))}>
              accept all
            </Button>
            <Button onClick={() => { setProposal(null); setDecisions({}); setNotes([]); }}>
              discard
            </Button>
            <span className="ml-auto font-mono text-[10px] text-[var(--color-faint)]">
              {keys.length - accepted.length} still pending
            </span>
          </div>
        </div>
      )}
    </>
  );
}

function SectionProposal({
  label,
  decision,
  onDecide,
  current,
  proposed,
  sectionKey,
}: {
  label: string;
  decision: Decision;
  onDecide: (d: Decision) => void;
  current: PromptSections;
  proposed: PromptSections;
  sectionKey: SectionKey;
}) {
  const diffs = diffSections(current, proposed).filter((d) => d.key === sectionKey);

  return (
    <div
      className="border-b border-[var(--color-border)]"
      style={{
        opacity: decision === 'rejected' ? 0.45 : 1,
        background:
          decision === 'accepted'
            ? 'color-mix(in srgb, var(--color-system) 6%, transparent)'
            : undefined,
      }}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="text-[12px] text-[var(--color-text)]">{label}</span>
        {decision !== 'pending' && (
          <Chip color={decision === 'accepted' ? 'var(--color-system)' : 'var(--color-faint)'}>
            {decision}
          </Chip>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            variant={decision === 'accepted' ? 'primary' : 'ghost'}
            onClick={() => onDecide(decision === 'accepted' ? 'pending' : 'accepted')}
          >
            accept
          </Button>
          <Button
            variant="ghost"
            onClick={() => onDecide(decision === 'rejected' ? 'pending' : 'rejected')}
          >
            reject
          </Button>
        </div>
      </div>
      <DiffView diffs={diffs} />
    </div>
  );
}
