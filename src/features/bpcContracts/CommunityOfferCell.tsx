import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { Tooltip } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { useOnline } from '@/stores/network';
import type { BpcSearchRow } from '@/engine/contracts/bpcSearch';

export function CommunityOfferCell({
  row,
  title,
  canAsk,
  onAsk,
}: {
  row: Extract<BpcSearchRow, { source: 'community' }>;
  title: ReactNode;
  canAsk: boolean;
  onAsk: () => void;
}) {
  const { t } = useTranslation();
  const online = useOnline();
  return (
    <span
      className={cx(
        'flex min-w-0 flex-wrap items-center gap-1.5 sm:flex-col sm:flex-nowrap sm:items-start sm:gap-1',
        row.stale && 'opacity-60'
      )}
    >
      <span className="min-w-0 max-w-full">{title}</span>
      <span className="inline-flex flex-wrap items-center gap-1.5 text-[0.6875rem] font-normal text-text-dim">
        {row.runs !== -1 ? (
          <span>{t('bpcContracts.communityFrom', { name: row.memberName })}</span>
        ) : canAsk ? (
          <Tooltip content={online ? null : t('common.needsConnection')}>
            <button
              type="button"
              className={inlineLinkClassName}
              aria-disabled={online ? undefined : true}
              onClick={online ? onAsk : (event) => event.preventDefault()}
            >
              {t('bpcContracts.communityAskToCopyAction', { name: row.memberName })}
            </button>
          </Tooltip>
        ) : (
          <span>{t('bpcContracts.communityAskToCopy', { name: row.memberName })}</span>
        )}
        <span className="text-[0.6875rem] font-semibold tracking-widest uppercase">
          {t('bpcContracts.communityChip', {
            names: row.communities.map((c) => c.name).join(', '),
          })}
        </span>
        {row.stale && <Pill>{t('communities.staleBadge')}</Pill>}
      </span>
    </span>
  );
}
