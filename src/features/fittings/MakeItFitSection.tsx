import type { ReactNode } from 'react';
import { STAT_DETAIL, STAT_EYEBROW } from './statKit';

export function MakeItFitSection({
  heading,
  hint,
  children,
}: {
  heading: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div>
        <h3 className={STAT_EYEBROW}>{heading}</h3>
        {hint && <p className={STAT_DETAIL}>{hint}</p>}
      </div>
      {children}
    </section>
  );
}
