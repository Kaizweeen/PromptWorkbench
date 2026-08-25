'use client';

/**
 * Pass/fail matrix: rows are test cases, columns are versions.
 *
 * This is the view that answers "did v4 regress against v3".
 */

import type { MatrixCell } from '@/lib/repo';
import { Empty } from './ui';

export interface MatrixVersion {
  id: string;
  number: number;
}

export function ResultMatrix({
  cases,
  versions,
  cells,
}: {
  cases: Array<{ id: string; name: string }>;
  versions: MatrixVersion[];
  cells: MatrixCell[];
}) {
  if (cases.length === 0) return <Empty>No test cases yet.</Empty>;

  const byKey = new Map(cells.map((c) => [`${c.testCaseId}::${c.versionId}`, c]));
  // Newest versions first, capped so the matrix stays readable.
  const columns = [...versions].sort((a, b) => b.number - a.number).slice(0, 8);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-[var(--color-faint)]">
            <th className="px-3 py-1.5 text-left font-mono text-[10px] font-normal uppercase tracking-widest">
              case
            </th>
            {columns.map((v) => (
              <th key={v.id} className="px-2 py-1.5 text-center font-mono text-[10px] font-normal">
                v{v.number}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cases.map((testCase) => (
            <tr key={testCase.id} className="border-b border-[var(--color-border)]">
              <td className="max-w-[220px] truncate px-3 py-1.5 text-[var(--color-text)]">
                {testCase.name}
              </td>
              {columns.map((v) => {
                const cell = byKey.get(`${testCase.id}::${v.id}`);
                return (
                  <td key={v.id} className="px-2 py-1.5 text-center">
                    <Cell cell={cell} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ cell }: { cell?: MatrixCell }) {
  if (!cell) {
    return (
      <span className="font-mono text-[10px] text-[var(--color-faint)]" title="Not run">
        ·
      </span>
    );
  }

  return (
    <span
      title={cell.detail ?? undefined}
      className="cursor-help font-mono text-[11px]"
      style={{ color: cell.passed ? 'var(--color-system)' : '#f0757a' }}
    >
      {cell.passed ? 'pass' : 'fail'}
    </span>
  );
}
