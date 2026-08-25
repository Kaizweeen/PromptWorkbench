import { MODELS, MODEL_ORDER, formatCost, estimateCost } from '@/lib/config';
import { SAMPLE_SECTIONS, SAMPLE_STACK } from '@/lib/fixtures';
import { renderPrompt } from '@/lib/render';
import { isSectionEmpty, orderedSections } from '@/lib/sections';

export const dynamic = 'force-dynamic';

/**
 * Phase 1 smoke page. Proves the section model and the renderer work
 * end to end. The real three-pane editor arrives in Phase 2.
 */
export default function Page() {
  const rendered = renderPrompt(SAMPLE_SECTIONS, { stack: SAMPLE_STACK });
  const sections = orderedSections();

  return (
    <main className="mx-auto max-w-[1400px] px-6 py-6">
      <header className="mb-6 flex items-baseline justify-between border-b border-[var(--color-border)] pb-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold tracking-tight">Prompt Workbench</h1>
          <span className="text-[11px] text-[var(--color-faint)]">
            phase 1 — foundation
          </span>
        </div>
        <span className="font-mono text-[11px] text-[var(--color-faint)]">
          renderer + schema smoke test
        </span>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section>
          <PaneTitle>Section model</PaneTitle>
          <ol className="space-y-px">
            {sections.map((spec) => {
              const empty = isSectionEmpty(SAMPLE_SECTIONS, spec.key);
              return (
                <li
                  key={spec.key}
                  className="border-l-2 bg-[var(--color-panel)] px-3 py-2"
                  style={{
                    borderColor: empty
                      ? 'var(--color-border)'
                      : channelColor(spec.channel),
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-4 font-mono text-[11px] text-[var(--color-faint)]">
                      {spec.order}
                    </span>
                    <span
                      className={
                        empty
                          ? 'text-[var(--color-faint)]'
                          : 'font-medium text-[var(--color-text)]'
                      }
                    >
                      {spec.label}
                    </span>
                    {spec.tag && (
                      <code className="font-mono text-[10px] text-[var(--color-muted)]">
                        &lt;{spec.tag}&gt;
                      </code>
                    )}
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wide"
                      style={{ color: channelColor(spec.channel) }}>
                      {empty ? 'omitted' : spec.channel}
                    </span>
                  </div>
                  <p className="mt-1 pl-6 text-[11px] leading-relaxed text-[var(--color-muted)]">
                    {spec.hint}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        <section>
          <PaneTitle>Rendered prompt</PaneTitle>
          <TurnBlock label="system" color="var(--color-system)" body={rendered.system} />
          <TurnBlock label="user" color="var(--color-user)" body={rendered.user} />
          {rendered.prefill && (
            <TurnBlock
              label="assistant (prefill)"
              color="var(--color-prefill)"
              body={rendered.prefill}
            />
          )}

          <PaneTitle className="mt-5">Models</PaneTitle>
          <table className="w-full border-collapse font-mono text-[11px]">
            <thead>
              <tr className="text-left text-[var(--color-faint)]">
                <th className="py-1 font-normal">model</th>
                <th className="py-1 font-normal">in/out $MTok</th>
                <th className="py-1 font-normal">prefill</th>
                <th className="py-1 text-right font-normal">10k/2k run</th>
              </tr>
            </thead>
            <tbody>
              {MODEL_ORDER.map((id) => {
                const m = MODELS[id];
                const cost = estimateCost(
                  { input_tokens: 10_000, output_tokens: 2_000 },
                  id,
                );
                return (
                  <tr key={id} className="border-t border-[var(--color-border)]">
                    <td className="py-1.5 text-[var(--color-text)]">{m.id}</td>
                    <td className="py-1.5 text-[var(--color-muted)]">
                      {m.pricing.input} / {m.pricing.output}
                    </td>
                    <td className="py-1.5">
                      <span
                        style={{
                          color: m.supportsPrefill
                            ? 'var(--color-system)'
                            : 'var(--color-faint)',
                        }}
                      >
                        {m.supportsPrefill ? 'ok' : '400'}
                      </span>
                    </td>
                    <td className="py-1.5 text-right text-[var(--color-muted)]">
                      {formatCost(cost)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

function channelColor(channel: string): string {
  if (channel === 'system') return 'var(--color-system)';
  if (channel === 'user') return 'var(--color-user)';
  return 'var(--color-prefill)';
}

function PaneTitle({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`mb-2 font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)] ${className}`}
    >
      {children}
    </h2>
  );
}

function TurnBlock({
  label,
  color,
  body,
}: {
  label: string;
  color: string;
  body: string;
}) {
  return (
    <div className="mb-3 border border-[var(--color-border)] bg-[var(--color-panel)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color }}>
          {label}
        </span>
        <span className="font-mono text-[10px] text-[var(--color-faint)]">
          {body.length} chars
        </span>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[11px] leading-relaxed text-[var(--color-text)]">
        {body || '(empty)'}
      </pre>
    </div>
  );
}
