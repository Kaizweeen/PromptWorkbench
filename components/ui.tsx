/** Shared chrome primitives. Dense, dark, no decoration. */

import type { ReactNode } from 'react';

export function PaneTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-3">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-faint)]">
        {children}
      </span>
      {right}
    </div>
  );
}

export function Pane({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col border-r border-[var(--color-border)] ${className}`}
    >
      {children}
    </section>
  );
}

const BUTTON_BASE =
  'inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:opacity-40';

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'default',
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'default' | 'primary' | 'ghost';
  disabled?: boolean;
  title?: string;
}) {
  const styles = {
    default:
      'border-[var(--color-border-strong)] bg-[var(--color-panel-2)] text-[var(--color-text)] hover:border-[var(--color-faint)]',
    primary:
      'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)] hover:bg-[color-mix(in_srgb,var(--color-accent)_25%,transparent)]',
    ghost:
      'border-transparent text-[var(--color-muted)] hover:border-[var(--color-border)] hover:text-[var(--color-text)]',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${BUTTON_BASE} ${styles}`}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="border border-[var(--color-border-strong)] bg-[var(--color-panel-2)] px-1 font-mono text-[10px] text-[var(--color-muted)]">
      {children}
    </kbd>
  );
}

export function Chip({
  children,
  color = 'var(--color-muted)',
  title,
}: {
  children: ReactNode;
  color?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="border px-1.5 py-0.5 font-mono text-[10px]"
      style={{ color, borderColor: `color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 py-6 text-center font-mono text-[11px] text-[var(--color-faint)]">
      {children}
    </div>
  );
}

export function relativeTime(unixSeconds: number): string {
  const diff = Date.now() / 1000 - unixSeconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2_592_000) return `${Math.floor(diff / 86_400)}d ago`;
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
