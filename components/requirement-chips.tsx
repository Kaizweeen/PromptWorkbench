'use client';

/** Extracted requirements as editable chips. Persist across brainstorm turns. */

import { useState } from 'react';
import { Button } from './ui';

export function RequirementChips({
  requirements,
  onChange,
}: {
  requirements: string[];
  onChange: (next: string[]) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [buffer, setBuffer] = useState('');

  function commit(index: number) {
    const value = buffer.trim();
    onChange(
      value === ''
        ? requirements.filter((_, i) => i !== index)
        : requirements.map((r, i) => (i === index ? value : r)),
    );
    setEditing(null);
  }

  return (
    <div className="border-b border-[var(--color-border)] px-3 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
          requirements
        </span>
        <span className="font-mono text-[10px] text-[var(--color-muted)]">
          {requirements.length}
        </span>
      </div>

      {requirements.length === 0 ? (
        <p className="font-mono text-[10px] text-[var(--color-faint)]">
          none yet — they appear as the interview goes on
        </p>
      ) : (
        <ul className="space-y-1">
          {requirements.map((req, i) => (
            <li key={i} className="flex items-start gap-1">
              {editing === i ? (
                <input
                  autoFocus
                  value={buffer}
                  onChange={(e) => setBuffer(e.target.value)}
                  onBlur={() => commit(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commit(i);
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  className="min-w-0 flex-1 border border-[var(--color-accent)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text)] outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setEditing(i);
                    setBuffer(req);
                  }}
                  title="Click to edit"
                  className="min-w-0 flex-1 border border-[var(--color-border)] px-1.5 py-0.5 text-left font-mono text-[11px] text-[var(--color-text)] hover:border-[var(--color-accent)]"
                >
                  {req}
                </button>
              )}
              <Button
                variant="ghost"
                onClick={() => onChange(requirements.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="ghost" onClick={() => onChange([...requirements, 'new requirement'])}>
        + requirement
      </Button>
    </div>
  );
}
