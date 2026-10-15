import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import type { BpcSearchRow } from '@/engine/contracts/bpcSearch';

/**
 * The Item cell of a Community Offer row in BPC Sourcing: the blueprint name,
 * then whose it is. A Shared BPO that can be copied reads "ask <name> to
 * copy…", a button (issue #3813); a copy reads "from <name>"; a BPO that
 * cannot be asked (a reaction formula) keeps the plain "ask <name> to copy".
 */
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
          // A raw button, not Button: it is a text-sized action inside the item
          // cell (DESIGN.md §6c, the inline link look), and the row has no
          // primary action of its own, so the name beside it stays plain. The
          // trailing "…" says it opens a dialog needing more input.
          <button type="button" className={inlineLinkClassName} onClick={onAsk}>
            {t('bpcContracts.communityAskToCopyAction', { name: row.memberName })}
          </button>
        ) : (
          <span>{t('bpcContracts.communityAskToCopy', { name: row.memberName })}</span>
        )}
        <span className="text-[0.625rem] font-semibold tracking-widest uppercase">
          {t('bpcContracts.communityChip', {
            names: row.communities.map((c) => c.name).join(', '),
          })}
        </span>
        {row.stale && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5">{t('communities.staleBadge')}</span>
        )}
      </span>
    </span>
  );
}
