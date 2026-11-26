import type { ReactNode } from 'react';

interface PlanEditorLayoutProps {
  sidebar?: ReactNode;
  children: ReactNode;
}

export function PlanEditorLayout({ sidebar, children }: PlanEditorLayoutProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr] lg:items-start">
      {sidebar && <aside className="space-y-4">{sidebar}</aside>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
