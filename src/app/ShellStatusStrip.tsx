import type { ReactNode } from 'react';

/**
 * The shell's one status strip above every route: the re-login prompt, a
 * missing corp role and a failed sync as rows of a single hairline box, where
 * each used to be its own card and pushed the page's first figure down by a
 * card's height apiece (#6560).
 *
 * Rows opt in with `data-status-item` (the children's live regions stay
 * outside the box). With no row on screen the strip is `hidden` and takes no
 * space, so a healthy page is unchanged.
 */
export function ShellStatusStrip({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 hidden rounded-xs border border-warning/40 bg-panel has-[[data-status-item]]:block [&>[data-status-item]~[data-status-item]]:border-t [&>[data-status-item]~[data-status-item]]:border-line">
      {children}
    </div>
  );
}
