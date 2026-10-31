import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Eyebrow,
  IskAmount,
  Panel,
  textActionClassName,
  ValueList,
  ValueRow,
} from '@/components/ui';
import { utcDay } from '@/engine/localDay';
import { iskWaiting, walletChange } from '@/engine/netWorth/waiting';
import { netToneClass } from '@/features/character/format';
import { openOrdersHref } from '@/features/market/openOrdersFilter';
import { cx } from '@/lib/cx';
import { formatIskCompactSigned } from '@/lib/isk';
import { useNetWorthData } from './useNetWorthData';
import { useSellOrderHealth } from './useSellOrderHealth';
import { WalletGoalsPanel } from './WalletGoalsPanel';

interface WalletWaitingGoalProps {
  characterIds: readonly number[];
}

/**
 * Under the ISK flow: ISK parked in orders and contracts, and the wallet Goals.
 * The Goals and most of ISK waiting read the stored Net Worth Snapshots; the
 * sell-order health reads live orders.
 */
export function WalletWaitingGoal({ characterIds }: WalletWaitingGoalProps) {
  const { t } = useTranslation();
  const data = useNetWorthData(characterIds);
  const health = useSellOrderHealth(characterIds);
  const rows = useMemo(
    () => characterIds.flatMap((id) => data.snapshotsByCharacter.get(id) ?? []),
    [characterIds, data.snapshotsByCharacter]
  );
  const [today] = useState(() => utcDay(Date.now()));
  const waiting = useMemo(() => iskWaiting(rows, today), [rows, today]);
  const change = useMemo(() => walletChange(rows, today), [rows, today]);

  if (!data.ready) return null;

  const waitingRows = [
    ['sellOrders', waiting.sellOrders],
    ['escrow', waiting.escrow],
    ['contracts', waiting.contracts],
  ] as const;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {rows.length > 0 && (
        <Panel title={t('wallet.waiting.title')}>
          <ValueList>
            {waitingRows.map(([key, isk]) => (
              <ValueRow
                key={key}
                label={t(`wallet.waiting.${key}`)}
                value={<IskAmount value={isk} decimals={0} />}
              />
            ))}
          </ValueList>
          {health && health.total.orders > 0 && (
            <div className="mt-3 border-t border-line pt-3 text-sm">
              <Eyebrow>
                {t('wallet.waiting.healthTitle')}:{' '}
                <IskAmount value={health.total.isk} decimals={0} />
              </Eyebrow>
              <ValueList variant="plain" className="mt-1">
                {(['healthy', 'needsYou', 'watch', 'notChecked'] as const)
                  .filter((key) => health[key].orders > 0)
                  .map((key) => (
                    <ValueRow
                      key={key}
                      label={t(`wallet.waiting.health.${key}`)}
                      note={t('wallet.waiting.orderCount', { count: health[key].orders })}
                      value={<IskAmount value={health[key].isk} decimals={0} />}
                    />
                  ))}
              </ValueList>
              {health.needsYou.orders > 0 && (
                <Link
                  to={openOrdersHref({
                    characterIds: characterIds.length > 0 ? [...characterIds] : undefined,
                    workThrough: true,
                  })}
                  className={cx(textActionClassName(), 'mt-2')}
                >
                  {t('wallet.waiting.fixOrders')}
                </Link>
              )}
            </div>
          )}
          {change !== null && (
            <p className="mt-3 text-sm text-text-dim">
              {t('wallet.waiting.change')}{' '}
              <span className={cx('tabular-nums', netToneClass(change))}>
                {formatIskCompactSigned(change)}
              </span>
            </p>
          )}
        </Panel>
      )}
      <WalletGoalsPanel rows={rows} today={today} />
    </div>
  );
}
