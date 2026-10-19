import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import type { AppraisalUnmatched } from '@/engine/market/appraisalMatch';

/** A boxed list of pasted lines under a heading: the unmatched ones, or the abyssal ones. */
export function PastedLinesNote({
  heading,
  headingClassName = 'text-text-dim',
  entries,
  children,
}: {
  heading: ReactNode;
  headingClassName?: string;
  entries: readonly AppraisalUnmatched[];
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xs border border-line bg-panel-2 px-2.5 py-2">
      <p
        className={cx('text-[0.6875rem] font-semibold tracking-widest uppercase', headingClassName)}
      >
        {heading}
      </p>
      <ul className="pt-1">
        {entries.map((entry) => (
          <li key={entry.name} className="font-mono text-[0.6875rem] text-text-dim">
            {t('market.appraisal.unmatchedLine', {
              lines: entry.lines.join(', '),
              name: entry.name,
            })}
          </li>
        ))}
      </ul>
      {children}
    </div>
  );
}
