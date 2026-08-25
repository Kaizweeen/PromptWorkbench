import Link from 'next/link';
import { listPrompts } from '@/lib/repo';
import { LibraryPane } from '@/components/library-pane';
import { Chip, relativeTime } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default function LibraryPage() {
  const prompts = listPrompts();

  return (
    <div className="grid h-dvh grid-cols-[260px_minmax(0,1fr)] overflow-hidden">
      <LibraryPane prompts={prompts} />

      <main className="min-h-0 overflow-y-auto">
        <header className="flex h-8 items-center justify-between border-b border-[var(--color-border)] px-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
            all prompts
          </span>
        </header>

        {prompts.length === 0 ? (
          <div className="px-4 py-10">
            <p className="text-[13px] text-[var(--color-text)]">No prompts yet.</p>
            <p className="mt-1 text-[12px] text-[var(--color-muted)]">
              Name one in the sidebar to start. Every save creates an immutable
              version you can diff and restore.
            </p>
          </div>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
                <th className="px-3 py-1.5 font-normal">name</th>
                <th className="px-3 py-1.5 font-normal">archetype</th>
                <th className="px-3 py-1.5 font-normal">tags</th>
                <th className="px-3 py-1.5 text-right font-normal">versions</th>
                <th className="px-3 py-1.5 text-right font-normal">modified</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--color-border)] hover:bg-[var(--color-panel)]"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/prompts/${p.id}`}
                      className="text-[var(--color-text)] hover:text-[var(--color-accent)]"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--color-muted)]">
                    {p.archetype}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {p.tags.length === 0 ? (
                        <span className="text-[var(--color-faint)]">—</span>
                      ) : (
                        p.tags.map((t) => (
                          <Chip key={t} color="var(--color-accent)">
                            {t}
                          </Chip>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] text-[var(--color-muted)]">
                    {p.versionCount}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[11px] text-[var(--color-faint)]">
                    {relativeTime(p.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
