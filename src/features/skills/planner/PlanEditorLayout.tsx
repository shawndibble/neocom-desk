import type { ReactNode } from 'react';

interface PlanEditorLayoutProps {
  /**
   * The sidebar column: everything you act *with*. Desktop only — callers
   * pass `undefined` below `lg`, where there is no second column and the
   * tools fold into the main one instead.
   */
  sidebar?: ReactNode;
  /** The main column: everything you look *at*. */
  children: ReactNode;
}

/**
 * The editor page's two-column shape, in one place.
 *
 * Shared rather than inlined in `PlanEditor` because the route needs the same
 * shape while the skill catalog is still loading: rendering a bare spinner
 * there instead would drop the plan list out of the sidebar on every load and
 * snap it back in, which is what the layout looked like before this was
 * extracted.
 */
export function PlanEditorLayout({ sidebar, children }: PlanEditorLayoutProps) {
  return (
    // `lg:items-start`: grid items stretch to the row's height by default, so
    // without this the sidebar gets pulled down to match a much taller entry
    // list and renders as one long, mostly-empty box.
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
      {sidebar && <aside className="space-y-4">{sidebar}</aside>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
