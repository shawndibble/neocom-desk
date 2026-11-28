import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import type { AppraisalUnmatched } from '@/engine/market/appraisalMatch';
import { Well } from '@/components/ui/Well';

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
    <Well size="md">
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
    </Well>
  );
}
