import type { ReactNode } from 'react';
interface PlanEditorLayoutProps {
  sidebar?: ReactNode;
  children: ReactNode;
}

export function PlanEditorLayout({ sidebar, children }: PlanEditorLayoutProps) {
  return (
    <div
      className={
        sidebar
          ? 'grid grid-cols-[20rem_minmax(0,1fr)] items-start gap-4'
          : 'grid grid-cols-1 gap-4'
      }
    >
      {sidebar && <aside className="space-y-4">{sidebar}</aside>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}
