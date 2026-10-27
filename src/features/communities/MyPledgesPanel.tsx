import { useTranslation } from 'react-i18next';
import { Button, EmptyState, SlideOver } from '@/components/ui';
import { STALE_PLEDGE_DAYS, lineKey, type MyPledgeRow } from '@/engine/communities/requests';
import { cx } from '@/lib/cx';
import { formatQuantity } from './requestFormat';

/**
 * My pledges: every Pledge this Member holds on an open Request, newest first,
 * in the same slide-out shape as My sharing. A Pledge with no delivery after
 * 14 days is greyed and says so in words; nothing is released for it. Open
 * request closes this panel and opens that Request's side panel, where the
 * Pledge is changed or withdrawn.
 */
export function MyPledgesPanel({
  open,
  rows,
  communityName,
  onClose,
  onOpenRequest,
}: {
  open: boolean;
  rows: MyPledgeRow[];
  communityName: string;
  onClose: () => void;
  onOpenRequest: (requestId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title={t('communities.board.myPledges.title')}
      subtitle={t('communities.board.myPledges.subtitle', { community: communityName })}
    >
      {rows.length === 0 ? (
        <EmptyState
          title={t('communities.board.myPledges.empty')}
          hint={t('communities.board.myPledges.emptyHint')}
        />
      ) : (
        <ul
          className="divide-y divide-line text-sm"
          aria-label={t('communities.board.myPledges.listLabel')}
        >
          {rows.map(({ request, line, entry, stale }) => (
            <li
              key={`${request.id}:${lineKey(line)}`}
              className={cx('space-y-1 px-1 py-2.5', stale && 'opacity-60')}
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{line.name}</span>
                <span className="text-xs text-text-dim">
                  {t('communities.board.myPledges.for', { name: request.ownerName })}
                </span>
              </div>
              <p className="text-xs text-text-dim tabular-nums">
                {t('communities.board.myPledges.pledgedDelivered', {
                  pledged: formatQuantity(entry.quantity),
                  delivered: formatQuantity(entry.delivered),
                })}
              </p>
              {stale && (
                <p className="text-xs text-text-dim">
                  {t('communities.board.myPledges.stale', { days: STALE_PLEDGE_DAYS })}
                </p>
              )}
              <Button
                size="sm"
                aria-label={t('communities.board.myPledges.openRequestOf', {
                  name: `${request.ownerName} (${line.name})`,
                })}
                onClick={() => onOpenRequest(request.id)}
              >
                {t('communities.board.myPledges.openRequest')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SlideOver>
  );
}
