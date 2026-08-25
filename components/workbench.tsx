'use client';

/**
 * The editing shell: section editor on the left, live preview (or version
 * history) on the right. Holds the working copy of the sections; saving
 * appends a new immutable version.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { renderPrompt, type TechStack } from '@/lib/render';
import type { Channel, PromptSections, SectionKey } from '@/lib/sections';
import { detectVariables } from '@/lib/variables';
import { fromTechStack, toTechStack } from '@/lib/stack';
import { applyDraft, type ApplyMode } from '@/lib/generate';
import type { ArchetypeId } from '@/lib/templates';
import { saveVersionAction, updateMetaAction } from '@/app/actions';
import { GeneratePanel } from './generate-panel';
import type { PresetSummary } from './stack-picker';
import { PreviewPane } from './preview-pane';
import { RunPanel } from './run-panel';
import { BrainstormPanel } from './brainstorm-panel';
import { RequirementChips } from './requirement-chips';
import { SectionEditor } from './section-editor';
import { VariableBar } from './variable-bar';
import { VersionHistory, type VersionSummary } from './version-history';
import { Button, Kbd, Pane, PaneTitle } from './ui';

type RightTab = 'preview' | 'run' | 'brainstorm' | 'generate' | 'history';

export function Workbench({
  promptId,
  latestVersionId,
  archetype,
  initialSections,
  initialStack,
  channelOverrides,
  versions,
  presets,
}: {
  promptId: string;
  latestVersionId: string;
  archetype: ArchetypeId;
  initialSections: PromptSections;
  initialStack: TechStack | null;
  channelOverrides: Partial<Record<SectionKey, Channel>> | null;
  versions: VersionSummary[];
  presets: PresetSummary[];
}) {
  const router = useRouter();
  const [sections, setSections] = useState(initialSections);
  const [stackSelection, setStackSelection] = useState(() => fromTechStack(initialStack));
  // Generation inputs live here rather than in the panel so switching tabs
  // does not discard what you typed.
  const [goal, setGoal] = useState('');
  const [requirements, setRequirements] = useState<string[]>([]);
  const [currentArchetype, setCurrentArchetype] = useState<ArchetypeId>(archetype);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<RightTab>('preview');
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const stack = useMemo(() => toTechStack(stackSelection), [stackSelection]);

  // The working copy differs from the last saved version. Stack counts too —
  // it is stored on the version and renders into the prompt.
  const dirty = useMemo(
    () =>
      JSON.stringify(sections) !== JSON.stringify(initialSections) ||
      JSON.stringify(stack) !== JSON.stringify(initialStack ?? []),
    [sections, initialSections, stack, initialStack],
  );

  const rendered = useMemo(
    () =>
      renderPrompt(sections, {
        stack,
        channelOverrides: channelOverrides ?? undefined,
      }),
    [sections, stack, channelOverrides],
  );

  const variables = useMemo(() => detectVariables(sections), [sections]);

  const save = useCallback(() => {
    if (!dirty || pending) return;
    startTransition(async () => {
      await saveVersionAction(
        promptId,
        { sections, stack, channelOverrides },
        message,
      );
      setMessage('');
      setSavedAt(Date.now());
      router.refresh();
    });
  }, [dirty, pending, promptId, sections, stack, channelOverrides, message, router]);

  function changeArchetype(id: ArchetypeId) {
    setCurrentArchetype(id);
    startTransition(async () => {
      await updateMetaAction(promptId, { archetype: id });
      router.refresh();
    });
  }

  function applyGenerated(draft: PromptSections, mode: ApplyMode) {
    setSections((prev) => applyDraft(prev, draft, mode));
    setTab('preview');
  }

  // Cmd/Ctrl+S saves a version.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Warn before losing unsaved edits on navigation away.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <>
      <Pane>
        <PaneTitle
          right={
            <div className="flex items-center gap-1.5">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="version message (optional)"
                className="w-48 border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
              />
              <Button
                variant={dirty ? 'primary' : 'default'}
                onClick={save}
                disabled={!dirty || pending}
                title="Save a new version (⌘S)"
              >
                {pending ? 'saving…' : dirty ? 'save version' : 'saved'}
              </Button>
            </div>
          }
        >
          editor{dirty && <span className="ml-1.5 text-[var(--color-user)]">●</span>}
        </PaneTitle>

        <VariableBar variables={variables} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SectionEditor sections={sections} onChange={setSections} />
          <div className="flex items-center gap-2 px-3 py-3 text-[var(--color-faint)]">
            <Kbd>⌘S</Kbd>
            <span className="font-mono text-[10px]">save version</span>
            <Kbd>⌘⇧C</Kbd>
            <span className="font-mono text-[10px]">copy rendered prompt</span>
            {savedAt && (
              <span className="ml-auto font-mono text-[10px] text-[var(--color-system)]">
                version saved
              </span>
            )}
          </div>
        </div>
      </Pane>

      <Pane className="border-r-0">
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-[var(--color-border)] px-2">
          <TabButton active={tab === 'preview'} onClick={() => setTab('preview')}>
            preview
          </TabButton>
          <TabButton active={tab === 'run'} onClick={() => setTab('run')}>
            run
          </TabButton>
          <TabButton active={tab === 'brainstorm'} onClick={() => setTab('brainstorm')}>
            brainstorm
          </TabButton>
          <TabButton active={tab === 'generate'} onClick={() => setTab('generate')}>
            generate
          </TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
            history ({versions.length})
          </TabButton>
        </div>

        {tab === 'preview' && <PreviewPane rendered={rendered} />}
        {tab === 'run' && (
          <RunPanel
            versionId={latestVersionId}
            sections={sections}
            stack={stack}
            channelOverrides={channelOverrides}
            variables={variables}
            dirty={dirty}
          />
        )}
        {tab === 'brainstorm' && (
          <>
            <RequirementChips
              requirements={requirements}
              onChange={setRequirements}
            />
            <BrainstormPanel
              requirements={requirements}
              onRequirements={setRequirements}
              onGenerate={(nextGoal, nextRequirements) => {
                if (nextGoal !== '') setGoal(nextGoal);
                setRequirements(nextRequirements);
                setTab('generate');
              }}
            />
          </>
        )}
        {tab === 'generate' && (
          <GeneratePanel
            archetype={currentArchetype}
            onArchetype={changeArchetype}
            goal={goal}
            onGoal={setGoal}
            requirements={requirements}
            onRequirements={setRequirements}
            stackSelection={stackSelection}
            onStackSelection={setStackSelection}
            presets={presets}
            onApplyPreset={(s) => setStackSelection(fromTechStack(s))}
            current={sections}
            onApply={applyGenerated}
          />
        )}
        {tab === 'history' && (
          <VersionHistory promptId={promptId} versions={versions} />
        )}
      </Pane>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-b-2 px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors"
      style={{
        color: active ? 'var(--color-text)' : 'var(--color-faint)',
        borderColor: active ? 'var(--color-accent)' : 'transparent',
      }}
    >
      {children}
    </button>
  );
}
