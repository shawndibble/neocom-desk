import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
import { cx } from '@/lib/cx';
import { formatMarketIsk } from '@/lib/isk';
import { JumpsAwayText } from '@/features/assets/assetBrowserRows';
import { formatPercent } from '@/features/refining/formatPercent';
import { useRefiningSetup } from '@/features/refining/useRefiningSetup';
import {
  appliedRefiningImplantPct,
  refiningImplantApplies,
} from '@/engine/industry/characterModifiers';
import { ImplantsAssumedNote } from '@/features/character/ImplantsAssumedNote';
import type { RegionCompetition } from './orderCompetition';
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderDetailView } from './orderDetailView';
import { orderExits, hubHaulGaps, stationSystemId, type OrderExitKind } from './orderExits';
import { useBuyJumps } from './useBuyJumps';
import { computeSellThrough } from './orderScopeState';
import { CopyablePrice } from './CopyablePrice';
import { marketIskTone, signedMarketIsk } from '@/lib/signedIsk';

/** Short label for an exit's kind in the "Other ways out" disclosure's trailing read — distinct from the exit's own full sentence, which states the price rather than the net. */
const EXIT_SHORT_KEY: Record<OrderExitKind, string> = {
  hold: 'exitShortHold',
  undercutStation: 'exitShortUndercutStation',
  dumpToBuyOrder: 'exitShortDumpToBuyOrder',
  reprocess: 'exitShortReprocess',
};

/** "Other ways out" (sell orders only): hold, undercut, dump, reprocess and the hub haul gaps. */
export function OrderExitsSection({
  row,
  deep,
  sell,
  hubs,
  hubsFailed,
  reprocessing,
  expanded,
  onToggle,
}: {
  row: OpenOrderRow;
  deep: RegionCompetition | null;
  sell: ReturnType<typeof computeSellThrough>;
  hubs: OrderDetailView['hubs'];
  hubsFailed: OrderDetailView['hubsFailed'];
  reprocessing: OrderDetailView['reprocessing'];
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { setup: refiningSetup } = useRefiningSetup();
  const buyJumps = useBuyJumps(deep ? stationSystemId(row, deep.competitors) : 0);
  const exits = orderExits({
    row,
    competitors: deep?.competitors,
    buyJumps,
    reprocessing: reprocessing && { ...reprocessing, refining: refiningSetup },
  });
  // Named only when it moved the number: never on scrap (f4b5a3f5).
  const refineImplantPct = reprocessing
    ? appliedRefiningImplantPct(reprocessing.modifiers, reprocessing.entry.specialisationSkillID)
    : 0;
  const haulGaps = hubHaulGaps({ row, hubs: hubs ?? [], competitors: deep?.competitors });
  const refine = exits.find((exit) => exit.kind === 'reprocess');

  const bestExit = exits.length
    ? exits.reduce((best, exit) => (exit.netPerUnit > best.netPerUnit ? exit : best))
    : null;
  const exitsTrailing = bestExit
    ? `${t(`market.orders.${EXIT_SHORT_KEY[bestExit.kind]}`)} · ${signedMarketIsk(bestExit.netPerUnit)}`
    : haulGaps.length
      ? `${haulGaps[0].systemName} · +${formatMarketIsk(haulGaps[0].overLocal)}`
      : t('market.orders.trailingNoExit');

  return (
    <section>
      <Disclosure
        label={t('market.orders.detail.sectionExits')}
        trailing={exitsTrailing}
        expanded={expanded}
        onToggle={onToggle}
      >
        <div className="space-y-1.5 px-3 py-2 text-xs">
          {exits.length === 0 ? (
            <p className="text-text-dim">{t('market.orders.exitsNoFloor')}</p>
          ) : (
            exits.map((exit) => {
              const exitLabel =
                exit.kind === 'hold' && sell.kind === 'known'
                  ? t('market.orders.exitHoldSellsIn', {
                      price: formatMarketIsk(exit.price),
                      days: sell.daysToClear,
                    })
                  : exit.dump?.movedPrice || exit.dump?.unsold
                    ? t(
                        exit.dump.unsold > 0
                          ? 'market.orders.exitDumpWalkedUnsold'
                          : 'market.orders.exitDumpWalked',
                        {
                          price: formatMarketIsk(exit.price),
                          topBid: formatMarketIsk(exit.dump.topBid),
                          takes: exit.dump.topBidTakes,
                          units: exit.dump.units + exit.dump.unsold,
                          unsold: exit.dump.unsold,
                        }
                      )
                    : t(`market.orders.exit${exit.kind[0].toUpperCase()}${exit.kind.slice(1)}`, {
                        price: formatMarketIsk(exit.price),
                      });
              return (
                <p key={exit.kind} className="flex items-baseline justify-between gap-3">
                  <span className="text-text-dim">
                    {/*
                              Only the undercut exit is a price to TYPE somewhere —
                              hold, dump and reprocess are all facts already true,
                              not suggestions — so only its label is click-to-copy.
                            */}
                    {exit.kind === 'undercutStation' ? (
                      <CopyablePrice price={exit.price}>{exitLabel}</CopyablePrice>
                    ) : (
                      exitLabel
                    )}
                  </span>
                  <span className={cx('shrink-0 tabular-nums', marketIskTone(exit.netPerUnit))}>
                    {t('market.orders.exitPerUnit', {
                      amount: signedMarketIsk(exit.netPerUnit),
                    })}
                  </span>
                </p>
              );
            })
          )}
          {/*
                    Hauling is a gap and a distance, never a net: what a hub pays
                    is knowable, what a courier charges is not. The rows survive a
                    missing Order Floor for the same reason — "Amarr bids more
                    than anyone here" needs no cost basis behind it.
                  */}
          <div className="border-t border-line pt-1.5">
            <p className={eyebrowClassName}>{t('market.orders.exitHaulTitle')}</p>
            {hubs === undefined ? (
              <p className="mt-1 text-text-dim">
                {t(
                  hubsFailed ? 'market.orders.exitHaulUnavailable' : 'market.orders.exitHaulLoading'
                )}
              </p>
            ) : haulGaps.length === 0 ? (
              <p className="mt-1 text-text-dim">{t('market.orders.exitHaulNone')}</p>
            ) : (
              <>
                {haulGaps.map((gap) => (
                  <p key={gap.hubId} className="mt-1 flex items-baseline justify-between gap-3">
                    <span className="text-text-dim">
                      {t('market.orders.exitHaulHub', {
                        hub: gap.systemName,
                        price: formatMarketIsk(gap.price),
                      })}{' '}
                      <JumpsAwayText result={gap.jumps} t={t} />
                    </span>
                    <span className="shrink-0 tabular-nums text-success">
                      {t('market.orders.exitHaulGap', {
                        amount: formatMarketIsk(gap.overLocal),
                        total: formatMarketIsk(gap.totalIsk),
                      })}
                    </span>
                  </p>
                ))}
                <p className="mt-1 text-text-dim">{t('market.orders.exitHaulNote')}</p>
              </>
            )}
          </div>
          {!reprocessing && (
            <p className="flex items-baseline justify-between gap-3 text-text-dim">
              <span>{t('market.orders.exitReprocessNotBuilt')}</span>
              <span className="shrink-0">{t('market.orders.exitNotBuilt')}</span>
            </p>
          )}
          {refine && (
            <>
              {/*
                        The assumption, stated rather than folded into the number:
                        a structure's own reprocessing rate, its rigs and the
                        standings-based station tax are not readable from ESI, so
                        this prices a plain NPC station with no tax deducted.
                      */}
              <p className="text-text-dim">
                {t('market.orders.exitReprocessAssumption', {
                  rate: formatPercent(refiningSetup.stationRate, false),
                  tax: formatPercent(refiningSetup.taxRate, false),
                })}
              </p>
              {refineImplantPct > 0 && (
                <p className="text-text-dim">
                  {t('market.orders.exitReprocessImplant', {
                    pct: refineImplantPct,
                  })}
                </p>
              )}
              {reprocessing && refiningImplantApplies(reprocessing.entry.specialisationSkillID) && (
                <ImplantsAssumedNote
                  characterId={row.characterId}
                  hint={t('market.orders.exitReprocessAssumesNoImplants', {
                    character: row.characterName,
                  })}
                />
              )}
              {refine.partial && (
                <p className="text-warning">{t('market.orders.exitReprocessPartial')}</p>
              )}
              {refine.unitsLeftOver !== undefined && refine.unitsLeftOver > 0 && (
                <p className="text-text-dim">
                  {t('market.orders.exitReprocessLeftOver', {
                    count: refine.unitsLeftOver,
                  })}
                </p>
              )}
            </>
          )}
          <p className="text-text-dim">{t('market.orders.orderSoFarNotBuilt')}</p>
        </div>
      </Disclosure>
    </section>
  );
}
