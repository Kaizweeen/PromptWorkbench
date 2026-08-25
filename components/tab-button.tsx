'use client';

/** One tab in the right-hand pane's tab bar. */

export function TabButton({
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
