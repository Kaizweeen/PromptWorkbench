'use client';

/**
 * Live rendered preview. Always visible while editing, and copyable in one
 * keystroke — the whole point is that you can see exactly what Claude receives.
 */

import { useCallback, useEffect, useState } from 'react';
import { renderFullText, type RenderedPrompt } from '@/lib/render';
import { Button, PaneTitle } from './ui';

export function PreviewPane({ rendered }: { rendered: RenderedPrompt }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(renderFullText(rendered));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }, [rendered]);

  // Cmd/Ctrl+Shift+C copies the rendered prompt from anywhere in the editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        void copy();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copy]);

  const totalChars =
    rendered.system.length + rendered.user.length + (rendered.prefill?.length ?? 0);

  return (
    <>
      <PaneTitle
        right={
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--color-faint)]">
              {totalChars} chars
            </span>
            <Button onClick={copy} title="Copy rendered prompt (⌘⇧C)">
              {copied ? 'copied' : 'copy'}
            </Button>
          </div>
        }
      >
        rendered preview
      </PaneTitle>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <Turn label="system" color="var(--color-system)" body={rendered.system} />
        <Turn label="user" color="var(--color-user)" body={rendered.user} />
        {rendered.prefill !== undefined && (
          <Turn
            label="assistant (prefill)"
            color="var(--color-prefill)"
            body={rendered.prefill}
            warning="Rejected with a 400 on Opus 5, Sonnet 5, and Fable 5. Only Haiku 4.5 accepts a prefill."
          />
        )}
        {totalChars === 0 && (
          <p className="px-1 py-6 text-center font-mono text-[11px] text-[var(--color-faint)]">
            Nothing to render yet — fill in a section.
          </p>
        )}
      </div>
    </>
  );
}

function Turn({
  label,
  color,
  body,
  warning,
}: {
  label: string;
  color: string;
  body: string;
  warning?: string;
}) {
  if (body === '') return null;

  return (
    <div className="mb-3 border border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-2.5 py-1">
        <span
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color }}
        >
          {label}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-faint)]">
          {body.length}
        </span>
      </div>
      {warning && (
        <p className="border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-prefill)_8%,transparent)] px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-[var(--color-prefill)]">
          {warning}
        </p>
      )}
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[var(--color-text)]">
        {body}
      </pre>
    </div>
  );
}
