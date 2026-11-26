import type { ReactNode } from 'react';

export function NewComponent({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div
      data-new-component={name}
      className="relative rounded-xs border border-dashed border-warning p-2 pt-5"
    >
      <span className="absolute left-2 top-1 text-xs font-semibold uppercase tracking-wide text-warning">
        New component: {name}
      </span>
      {children}
    </div>
  );
}
