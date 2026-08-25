'use client';

/**
 * Detected {{variables}}, listed with where they appear. Values are supplied by
 * test cases at run time; this bar exists so you can see at a glance what the
 * prompt will demand before you try to run it.
 */

import { sectionLabel, type DetectedVariable } from '@/lib/variables';
import { Chip } from './ui';

export function VariableBar({ variables }: { variables: DetectedVariable[] }) {
  if (variables.length === 0) {
    return (
      <div className="border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="font-mono text-[10px] text-[var(--color-faint)]">
          no variables — add {'{{placeholders}}'} to parameterise this prompt
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--color-border)] px-3 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
        vars
      </span>
      {variables.map((v) => (
        <Chip
          key={v.name}
          color="var(--color-accent)"
          title={`${v.total} use${v.total === 1 ? '' : 's'} in ${v.occurrences
            .map((o) => sectionLabel(o.section))
            .join(', ')}`}
        >
          {`{{${v.name}}}`}
          {v.total > 1 && (
            <span className="ml-1 text-[var(--color-faint)]">×{v.total}</span>
          )}
        </Chip>
      ))}
    </div>
  );
}
