import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPrompt, listPrompts, listStackPresets, listVersions } from '@/lib/repo';
import { LibraryPane } from '@/components/library-pane';
import { Workbench } from '@/components/workbench';
import type { VersionSummary } from '@/components/version-history';
import type { ArchetypeId } from '@/lib/templates';
import { isArchetypeId } from '@/lib/templates';

export const dynamic = 'force-dynamic';

// Next 16: params is a Promise and must be awaited.
export default async function PromptPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  const prompt = getPrompt(id);
  if (!prompt) notFound();

  const rows = listVersions(id);
  const latest = rows[0];
  if (!latest) notFound();

  const versions: VersionSummary[] = rows.map((v) => ({
    id: v.id,
    number: v.number,
    message: v.message,
    createdAt: v.createdAt,
    sections: v.sections,
    stack: v.stack,
    channelOverrides: v.channelOverrides,
  }));

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-3">
        <Link
          href="/"
          className="font-mono text-[11px] text-[var(--color-faint)] hover:text-[var(--color-text)]"
        >
          workbench
        </Link>
        <span className="text-[var(--color-faint)]">/</span>
        <span className="text-[13px] font-medium text-[var(--color-text)]">
          {prompt.name}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-faint)]">
          {prompt.archetype}
        </span>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-muted)]">
          v{latest.number}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
        <LibraryPane prompts={listPrompts()} activeId={id} />
        <Workbench
          promptId={id}
          latestVersionId={latest.id}
          archetype={
            isArchetypeId(prompt.archetype)
              ? (prompt.archetype as ArchetypeId)
              : 'custom'
          }
          initialSections={latest.sections}
          initialStack={latest.stack}
          channelOverrides={latest.channelOverrides}
          versions={versions}
          presets={listStackPresets().map((p) => ({
            id: p.id,
            name: p.name,
            stack: p.stack,
          }))}
        />
      </div>
    </div>
  );
}
