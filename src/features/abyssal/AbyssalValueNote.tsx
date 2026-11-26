import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from '@/components/ui/ExternalLink';
import { cx } from '@/lib/cx';
import type { AbyssalSummary } from '@/engine/market/abyssalValuation';
import { MUTAMARKET_SITE_URL } from '@/market/mutamarket';

export function AbyssalValueNote({
  summary,
  className,
}: {
  summary: AbyssalSummary;
  className?: string;
}) {
  const { t } = useTranslation();
  const parts = (
    [
      ['estimated', summary.priced],
      ['unpriced', summary.unpriced],
      ['pending', summary.pending],
    ] as const
  ).filter(([, count]) => count > 0);
  if (parts.length === 0) return null;
  return (
    <p
      data-testid="abyssal-value-note"
      className={cx(
        'flex flex-wrap items-baseline gap-x-1.5 text-[0.6875rem] text-text-dim',
        className
      )}
    >
      {parts.map(([key, count], index) => (
        <Fragment key={key}>
          {index > 0 && <span aria-hidden="true">·</span>}
          <span>{t(`assets.abyssal.${key}`, { count })}</span>
        </Fragment>
      ))}
      {summary.priced > 0 && (
        <>
          <span aria-hidden="true">·</span>
          <ExternalLink href={MUTAMARKET_SITE_URL}>{t('market.mutamarket.priceFrom')}</ExternalLink>
        </>
      )}
    </p>
  );
}
