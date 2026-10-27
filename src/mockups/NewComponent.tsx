import type { ReactNode } from 'react';

/**
 * Marks a piece of a mockup that is not an existing `src/components/ui`
 * primitive. The label is part of the picture, so a reviewer sees which parts
 * of the proposal need a new component. Every use is also listed in the
 * story's description (docs/design/mockups/README.md).
 */
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
