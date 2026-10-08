/**
 * What a lost ship cost (issue #2852): hull, fitted modules and cargo priced at
 * the Settings market hub, minus the insurance payout found in the wallet
 * journal when the victim is the active Character. Sits in Pilot Lookup's
 * loss-row expansion.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { computeNetLoss, matchInsurance, type LossInsurance } from '@/engine/losses/netLoss';
import { loadWalletJournal } from '@/features/character/wallet';
import { useMarketHub } from '@/features/market/hub';
import { formatIsk } from '@/lib/isk';
import type { KillmailDetail } from '@/lib/zkillboard';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { getHubPrices } from '@/market/prices';
import { useActiveCharacter } from '@/stores/activeCharacter';

interface LossSummaryProps {
  detail: KillmailDetail;
  /** zKillboard's kill-time value, shown for reference. */
  zkbValue: number | null;
}

type Insurance =
  { state: 'loading' } | { state: 'failed' } | { state: 'done'; value: LossInsurance | null };

export function LossSummary({ detail, zkbValue }: LossSummaryProps) {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const [prices, setPrices] = useState<ReadonlyMap<number, number | null> | null>(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  const [payout, setPayout] = useState<Insurance>({ state: 'loading' });
  useEffect(() => {
    void hydrateHub();
  }, [hydrateHub]);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const typeKey = useMemo(() => {
    const ids = new Set([detail.victim.ship_type_id]);
    for (const item of detail.victim.items ?? []) ids.add(item.item_type_id);
    return [...ids].sort((a, b) => a - b).join(',');
  }, [detail]);

  useEffect(() => {
    if (!hubHydrated) return;
    let cancelled = false;
    getHubPrices(hub, typeKey.split(',').map(Number))
      .then((aggregates) => {
        if (cancelled) return;
        const map = new Map<number, number | null>();
        for (const [id, aggregate] of aggregates) map.set(id, aggregate?.sellMin ?? null);
        setPrices(map);
      })
      .catch(() => {
        if (!cancelled) setPricesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [hub, hubHydrated, typeKey]);

  const isOwnLoss =
    activeCharacterId !== null && detail.victimParty?.characterId === activeCharacterId;
  useEffect(() => {
    if (!isOwnLoss || activeCharacterId === null || !detail.time) return;
    let cancelled = false;
    const killTime = Date.parse(detail.time);
    loadWalletJournal(activeCharacterId)
      .then((result) => {
        if (cancelled) return;
        setPayout({
          state: 'done',
          value: result === null ? null : matchInsurance(result.data, killTime),
        });
      })
      .catch(() => {
        if (!cancelled) setPayout({ state: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [isOwnLoss, activeCharacterId, detail.time]);

  if (pricesFailed) {
    return (
      <p role="status" className="text-xs text-warning">
        {t('travel.pilot.recent.lossSummary.pricesFailed')}
      </p>
    );
  }
  if (prices === null) {
    return (
      <p role="status" className="text-xs text-text-dim">
        {t('travel.pilot.recent.lossSummary.loading')}
      </p>
    );
  }

  const loss = computeNetLoss({
    victim: detail.victim,
    prices,
    insurance: payout.state === 'done' ? payout.value : null,
    zkbValue,
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
        {t('travel.pilot.recent.lossSummary.heading', { hub: hub.name })}
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
      {zkbValue !== null && (
        <p className="text-text-dim">
          {t('travel.pilot.recent.lossSummary.zkb', { value: formatIsk(zkbValue) })}
        </p>
      )}
    </section>
  );
}
