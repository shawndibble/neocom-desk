import { idSetKey } from '@/lib/idSetKey';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LiveNote } from '@/components/ui';
import { computeNetLoss, matchInsurance, type LossInsurance } from '@/engine/losses/netLoss';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { loadWalletJournal } from '@/features/character/wallet';
import { formatIsk } from '@/lib/isk';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import type { KillmailDetail } from '@/lib/zkillboard';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { useActiveCharacter } from '@/stores/activeCharacter';

interface LossSummaryProps {
  detail: KillmailDetail;
  zkbValue: number | null;
}

type Insurance =
  { state: 'loading' } | { state: 'failed' } | { state: 'done'; value: LossInsurance | null };

const hub = getTradeHub('jita') ?? DEFAULT_TRADE_HUB;

export function LossSummary({ detail, zkbValue }: LossSummaryProps) {
  const { t } = useTranslation();
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const mutaplasmids = useMutaplasmidLookup();

  const typeKey = useMemo(() => {
    const ids = new Set([detail.victim.ship_type_id]);
    for (const item of detail.victim.items ?? []) ids.add(item.item_type_id);
    return idSetKey(ids);
  }, [detail]);

  const loadPrices = useCallback(
    () =>
      getHubPrices(hub, typeKey.split(',').map(Number)).then((aggregates) => {
        const map = new Map<number, number | null>();
        for (const [id, aggregate] of aggregates) map.set(id, aggregate?.sellMin ?? null);
        return map as ReadonlyMap<number, number | null>;
      }),
    [typeKey]
  );
  const pricesLoad = useKeyedLoad(typeKey, loadPrices);
  const prices = pricesLoad.data ?? null;
  const pricesFailed = pricesLoad.status === 'failed';

  const isOwnLoss =
    activeCharacterId !== null && detail.victimParty?.characterId === activeCharacterId;
  const loadPayout = useCallback(
    () =>
      loadWalletJournal(activeCharacterId ?? 0).then((result) =>
        result === null ? null : matchInsurance(result.data, Date.parse(detail.time ?? ''))
      ),
    [activeCharacterId, detail.time]
  );
  const payoutLoad = useKeyedLoad(
    isOwnLoss && activeCharacterId !== null && detail.time
      ? `${activeCharacterId}:${detail.time}`
      : null,
    loadPayout
  );
  const payout: Insurance =
    payoutLoad.status === 'ready'
      ? { state: 'done', value: payoutLoad.data }
      : payoutLoad.status === 'failed'
        ? { state: 'failed' }
        : { state: 'loading' };

  if (pricesFailed) {
    return (
      <LiveNote className="text-xs text-warning">
        {t('travel.pilot.recent.lossSummary.pricesFailed')}
      </LiveNote>
    );
  }
  if (prices === null) {
    return (
      <LiveNote className="text-xs text-text-dim">
        {t('travel.pilot.recent.lossSummary.loading')}
      </LiveNote>
    );
  }

  const loss = computeNetLoss({
    victim: detail.victim,
    prices,
    insurance: payout.state === 'done' ? payout.value : null,
    zkbValue,
    isAbyssalType: mutaplasmids?.isAbyssalType,
  });
  const row = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4">
      <dt className="text-text-dim">{label}</dt>
      <dd className={strong ? 'font-semibold text-text tabular-nums' : 'text-text tabular-nums'}>
        {value}
      </dd>
    </div>
  );
  return (
    <section aria-label={t('travel.pilot.recent.lossSummary.title')} className="space-y-1 text-xs">
      <h4 className="font-semibold tracking-widest text-text-dim uppercase">
        {t('travel.pilot.recent.lossSummary.heading', { hub: hub.systemName })}
      </h4>
      <dl className="max-w-sm space-y-0.5">
        {row(t('travel.pilot.recent.lossSummary.hull'), formatIsk(loss.hull))}
        {row(t('travel.pilot.recent.lossSummary.fitted'), formatIsk(loss.fitted))}
        {row(t('travel.pilot.recent.lossSummary.cargo'), formatIsk(loss.cargo))}
        {row(t('travel.pilot.recent.lossSummary.lost'), formatIsk(loss.lost), true)}
        {isOwnLoss &&
          row(
            t(
              loss.insurance?.estimate
                ? 'travel.pilot.recent.lossSummary.insuranceEstimate'
                : 'travel.pilot.recent.lossSummary.insurance'
            ),
            payout.state === 'loading'
              ? '…'
              : loss.insurance
                ? `−${formatIsk(loss.insurance.amount)}`
                : '—'
          )}
        {isOwnLoss &&
          payout.state === 'done' &&
          row(t('travel.pilot.recent.lossSummary.net'), formatIsk(loss.net), true)}
      </dl>
      {loss.dropped > 0 && (
        <p className="text-text-dim">
          {t('travel.pilot.recent.lossSummary.dropped', { value: formatIsk(loss.dropped) })}
        </p>
      )}
      {loss.unpricedTypes.length > 0 && (
        <p className="text-warning">
          {t('travel.pilot.recent.lossSummary.unpriced', { count: loss.unpricedTypes.length })}
        </p>
      )}
      {loss.abyssalItems > 0 && (
        <p className="text-warning">
          {t('travel.pilot.recent.lossSummary.abyssal', { count: loss.abyssalItems })}
        </p>
      )}
      {zkbValue !== null && (
        <p className="text-text-dim">
          {t('travel.pilot.recent.lossSummary.zkb', { value: formatIsk(zkbValue) })}
        </p>
      )}
    </section>
  );
}
