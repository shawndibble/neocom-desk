import type { ReactNode } from 'react';

export function ShellStatusStrip({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 sr-only rounded-xs border border-warning/40 bg-panel has-[[data-status-item]]:not-sr-only [&>[data-status-item]~[data-status-item]]:border-t [&>[data-status-item]~[data-status-item]]:border-line">
      {children}
    </div>
  );
}
