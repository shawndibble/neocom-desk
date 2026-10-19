import type { ReactNode } from 'react';
import { STAT_EYEBROW } from './statKit';

/** One of Make it fit's kinds of fix — Train, Implants, Swap modules — under its heading. */
export function MakeItFitSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className={STAT_EYEBROW}>{heading}</h3>
      {children}
    </section>
  );
}
