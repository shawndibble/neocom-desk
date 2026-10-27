import type { ReactNode } from 'react';

/** One labelled row of the Survey's Additional information panel. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-text-dim">{label}</span>
      {children}
    </div>
  );
}
