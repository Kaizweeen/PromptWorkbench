'use client';

/**
 * Brainstorm: describe a vague goal, Claude interviews you one question at a
 * time, and the requirements it extracts accumulate as editable chips.
 */

import { useCallback, useRef, useState } from 'react';
import { decodeEvents, type RunEvent } from '@/lib/api/events';
import { goalFromConversation, parseBrainstormReply, type BrainstormTurn } from '@/lib/brainstorm';
import { Button, Empty, PaneTitle } from './ui';
import { Notice } from './run-controls';

export function BrainstormPanel({
  requirements,
  onRequirements,
  onGenerate,
}: {
  requirements: string[];
  onRequirements: (next: string[]) => void;
  onGenerate: (goal: string, requirements: string[]) => void;
}) {
  const [turns, setTurns] = useState<BrainstormTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(async () => {
    const content = draft.trim();
    if (content === '' || busy) return;

    const next: BrainstormTurn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setDraft('');
    setStreaming('');
    setError(null);
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let full = '';

    try {
      const res = await fetch('/api/brainstorm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ messages: next }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => ({ message: 'Request failed.' }));
        setError(detail.message ?? 'Request failed.');
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
          if (event.type === 'delta') {
            full += event.text;
            // Hide the requirements block while it is still being written.
            setStreaming(parseBrainstormReply(full).visible);
          } else if (event.type === 'error') {
            setError(event.message);
          }
        }
      }

      const parsed = parseBrainstormReply(full);
      if (parsed.visible !== '') {
        setTurns([...next, { role: 'assistant', content: parsed.visible }]);
      }
      // null means the reply carried no block, so keep what we already had.
      if (parsed.requirements !== null) onRequirements(parsed.requirements);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message);
    } finally {
      setStreaming('');
      setBusy(false);
      abortRef.current = null;
    }
  }, [draft, busy, turns, onRequirements]);

  return (
    <>
      <PaneTitle
        right={
          <Button
            variant="primary"
            disabled={requirements.length === 0}
            onClick={() => onGenerate(goalFromConversation(turns), requirements)}
            title={
              requirements.length === 0
                ? 'Talk through the goal first'
                : 'Turn this conversation into a populated draft'
            }
          >
            generate prompt from this
          </Button>
        }
      >
        brainstorm
      </PaneTitle>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {turns.length === 0 && streaming === '' && (
          <Empty>
            Describe what you want, vaguely is fine.
            <br />
            Claude will ask one question at a time.
          </Empty>
        )}

        <div className="space-y-2 px-3 py-2">
          {turns.map((turn, i) => (
            <Turn key={i} role={turn.role} content={turn.content} />
          ))}
          {streaming !== '' && <Turn role="assistant" content={streaming} />}
          {busy && streaming === '' && (
            <p className="font-mono text-[10px] text-[var(--color-faint)]">thinking…</p>
          )}
        </div>

        {error && <Notice color="#f0757a">{error}</Notice>}
      </div>

      <div className="shrink-0 border-t border-[var(--color-border)] p-2">
        <textarea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={
            turns.length === 0
              ? 'I need something that reviews PRs for security issues…'
              : 'your answer…'
          }
          className="w-full resize-none border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 font-mono text-[12px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
        <div className="mt-1 flex items-center gap-2">
          <Button variant="primary" onClick={send} disabled={busy || draft.trim() === ''}>
            {busy ? 'thinking…' : 'send'}
          </Button>
          {busy && <Button onClick={() => abortRef.current?.abort()}>stop</Button>}
          <span className="ml-auto font-mono text-[10px] text-[var(--color-faint)]">
            ⌘⏎ to send
          </span>
        </div>
      </div>
    </>
  );
}

function Turn({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div
      className="border-l-2 px-2 py-1"
      style={{
        borderColor: isUser ? 'var(--color-user)' : 'var(--color-accent)',
        background: isUser ? 'var(--color-panel)' : undefined,
      }}
    >
      <div
        className="mb-0.5 font-mono text-[10px] uppercase tracking-widest"
        style={{ color: isUser ? 'var(--color-user)' : 'var(--color-accent)' }}
      >
        {isUser ? 'you' : 'claude'}
      </div>
      <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-[var(--color-text)]">
        {content}
      </p>
    </div>
  );
}
