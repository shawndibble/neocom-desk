import { useRef } from 'react';

export interface TabItem {
  id: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tablist. */
  label?: string;
  className?: string;
}

/** Controlled horizontal tab bar. For peer views within a page, not navigation. */
export function Tabs({ tabs, value, onChange, label, className = '' }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.id === value);
    const delta = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    onChange(next.id);
    listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${next.id}"]`)?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex items-end gap-1 border-b border-line ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab-id={tab.id}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`-mb-px inline-flex h-8 items-center border-b-2 px-3 text-xs font-semibold tracking-widest uppercase transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
              active
                ? 'border-accent bg-panel-2/60 text-text'
                : 'border-transparent text-text-dim hover:bg-panel-2/40 hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
