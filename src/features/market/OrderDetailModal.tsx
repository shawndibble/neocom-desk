/**
 * Full breakdown of one open order (CONTEXT.md's redesigned Market > Open
 * Orders tab): what to do about it, the numbers behind that call, who is
 * cheaper and where, and — for a sell order — the cost-basis ledger the
 * floor came from.
 *
 * Kept dumb on purpose: every prop is already-loaded data plus loading flags.
 * `OpenOrdersPanel` owns every fetch (`ensureDeepChecked`, jump lookups,
 * price history for the "sells out in" chip) — this component only renders
 * what it is handed and asks for more via `onCheckDeeper`.
 *
 * The station/system/region three-way state a caller must not collapse:
 * - Station is always eager (`stationChecked` false only means the Fuzzwork
 *   aggregate call itself failed for this station — genuinely rare).
 * - System and region come from `deep`, fetched on demand. `deep === null`
 *   means "not checked yet" for BOTH; once it has run, `'system' in
 *   deep`'s undercut result can still be absent — my own order's system id
 *   could not be recovered from the region book (`openOrdersModel.ts`'s
 *   `deriveSystemId`) — which must render as "not checked" too, never as
 *   "checked, clean".
 */
import { useTranslation } from 'react-i18next';
import { Modal, StatChip, Button } from '@/components/ui';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { Link } from 'react-router-dom';
import { formatIsk } from '@/lib/isk';
import { salesTax, brokerFee } from '@/engine/industry/fees';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { JumpsAwayText } from '@/features/character/assetBrowserRows';
import type { UndercutRival } from '@/engine/market/undercut';
import { sellThrough, type SellThrough } from '@/engine/market/orderHealth';
import { filterPriceHistoryRange } from '@/engine/market/priceHistory';
import type { CharacterSkills, OpenOrderRow } from './openOrdersModel';
import type { RegionCompetition } from './orderCompetition';
import type { PriceHistoryResult } from './priceHistory';
import { OrderProblemBadge } from './OrderProblemBadge';
import { orderBadgeFor } from './orderBadgeKind';
import { OrderRowSummaryText } from './OrderRowSummaryText';

export interface OrderDetailModalProps {
  open: boolean;
  row: OpenOrderRow;
  /** Undefined only if the character's own skills failed to load — the ledger still renders, just without tax/broker lines. */
  skills: CharacterSkills | undefined;
  /** Null: not fetched yet (or the fetch failed and hasn't been retried). */
  deep: RegionCompetition | null;
  loadingDeep: boolean;
  /**
   * Null: not fetched yet (or the fetch failed and hasn't been retried) —
   * renders the same honest "can't tell yet" as no history at all, since
   * neither case can support a number.
   */
  history: PriceHistoryResult | null;
  /** Whether the cheap station-price tier actually returned an aggregate for this row's station+item. */
  stationChecked: boolean;
  /**
   * Whether the NPC-station lookup itself loaded. False (e.g. a first
   * offline visit — that file is deliberately outside the install precache)
   * must read as "not checked" for station/system, never as the false claim
   * that this order sits at a player structure.
   */
  stationsLoaded: boolean;
  /** Undefined while not yet requested/resolved. */
  regionJumps: JumpsAwayResult | undefined;
  /** Resolves a rival's location to a name, so the three scopes can be told apart when they quote the same seller. Returns null for a player structure. */
  stationNameFor: (locationId: number) => string | null;
  onCheckDeeper: () => void;
  onClose: () => void;
}

type ScopeState =
  | { kind: 'unavailable' }
  | { kind: 'notChecked' }
  | { kind: 'clear' }
  | { kind: 'rival'; rival: UndercutRival };

/**
 * `'known'` — the NPC-station lookup loaded and resolved this location.
 * `'structure'` — it loaded but this location isn't in it (a player
 * structure). `'unknown'` — the lookup itself hasn't loaded, so nothing
 * about this location can be claimed either way.
 */
type LocationState = 'known' | 'structure' | 'unknown';

function stationScopeState(
  row: OpenOrderRow,
  stationChecked: boolean,
  location: LocationState
): ScopeState {
  if (location === 'unknown') return { kind: 'notChecked' };
  if (location === 'structure') return { kind: 'unavailable' };
  if (!stationChecked) return { kind: 'notChecked' };
  if (row.station.bestPrice === null) return { kind: 'clear' };
  if (row.station.beatsMe) {
    return {
      kind: 'rival',
      rival: {
        scope: 'station',
        price: row.station.bestPrice,
        gapIsk: row.station.gapIsk,
        gapPct: row.station.gapPct,
        volumeRemain: 0,
        locationId: row.locationId,
        systemId: 0,
        ordersBeatingMe: 0,
        unitsBeatingMe: 0,
      },
    };
  }
  return { kind: 'clear' };
}

function deepScopeState(
  scope: 'system' | 'region',
  row: OpenOrderRow,
  deep: RegionCompetition | null,
  location: LocationState
): ScopeState {
  if (scope === 'system' && location === 'unknown') return { kind: 'notChecked' };
  if (scope === 'system' && location === 'structure') return { kind: 'unavailable' };
  if (deep === null) return { kind: 'notChecked' };
  const byScope = row.deepUndercut?.byScope ?? {};
  if (!(scope in byScope)) return { kind: 'notChecked' };
  const rival = byScope[scope];
  if (rival) return { kind: 'rival', rival };
  // A rival was found here despite truncation, that finding stands. But a
  // CLEAN read from a truncated book is only proof of absence for the pages
  // it actually saw — honest is "not checked", not "clear".
  if (deep.truncated) return { kind: 'notChecked' };
  return { kind: 'clear' };
}

/**
 * One scope's line in the "who is cheaper, and where" table.
 *
 * Five columns, because the three scopes routinely carry the SAME rival —
 * one seller at your own station is, by construction, also the cheapest in
 * your system and can be the cheapest in the region too. Three identical
 * ISK figures on three bare rows read as a bug; the same three beside the
 * station they sit in, the ISK gap, and the distance read as what they are.
 *
 * A state that isn't a rival (not checked, clear, structure) has nothing to
 * put in those four columns, so it spans them rather than printing dashes.
 */
function ScopeRow({
  label,
  state,
  stationName,
  distance,
  jumps,
}: {
  label: string;
  state: ScopeState;
  /** Where the rival sits, when this app resolved that location. */
  stationName?: string | null;
  /** Fixed distance wording for a scope whose answer is structural (station, system). */
  distance?: string;
  jumps?: JumpsAwayResult;
}) {
  const { t } = useTranslation();
  const scopeLabel = (
    <span className="font-semibold tracking-widest text-text-dim uppercase">{label}</span>
  );

  if (state.kind !== 'rival') {
    return (
      <div className="grid grid-cols-[6rem_1fr] gap-x-3 border-t border-line py-1.5 text-xs">
        {scopeLabel}
        <span className={state.kind === 'clear' ? 'text-success' : 'text-text-dim'}>
          {state.kind === 'unavailable' && t('market.orders.structureMarketUnavailable')}
          {state.kind === 'notChecked' && t('market.orders.scopeNotChecked')}
          {state.kind === 'clear' && t('market.orders.scopeClear')}
        </span>
      </div>
    );
  }

  const { rival } = state;
  // The station tier is a Fuzzwork aggregate: a price, never an order count.
  // `stationScopeState` fills those fields with 0, so they are only ever read
  // when the deep book actually supplied them.
  const countsKnown = rival.ordersBeatingMe > 0;

  return (
    <div className="grid grid-cols-[6rem_1fr_auto] gap-x-3 gap-y-0.5 border-t border-line py-1.5 text-xs md:grid-cols-[6rem_1fr_auto_auto_auto]">
      {scopeLabel}
      <span className="flex flex-col gap-0.5">
        <span>{stationName ?? t('market.unknownStructure')}</span>
        <span className="text-[0.6875rem] text-text-dim">
          {countsKnown
            ? [
                t('market.orders.rowSummary.sellersUnderMe', { count: rival.ordersBeatingMe }),
                t('market.orders.scopeUnitsUnder', {
                  units: rival.unitsBeatingMe.toLocaleString(),
                }),
              ].join(' · ')
            : t('market.orders.scopeAggregateOnly')}
        </span>
      </span>
      <span className="tabular-nums">{formatIsk(rival.price, 2)}</span>
      <span className="text-danger tabular-nums">
        {formatIsk(rival.gapIsk, 2)} · {rival.gapPct.toFixed(1)}%
      </span>
      <span className="text-text-dim tabular-nums">
        {jumps ? <JumpsAwayText result={jumps} t={t} /> : (distance ?? '')}
      </span>
    </div>
  );
}

/**
 * "Sells out in": `sellThrough` fed with this order's remaining volume, the
 * region's recent average daily units (last 30 days of price history — the
 * same window `sellsOutNoSales`'s wording promises), and the player's share
 * of the units listed at their price or better.
 *
 * No usable history at all (never fetched, fetch failed, or ESI genuinely
 * has none) reads as `'noHistory'` — never a fabricated rate.
 *
 * `myShare` comes from the deep competitors already in hand: same side
 * (a buy order only queues behind other buy orders), priced at-or-better
 * than mine, my own remaining volume as a fraction of that whole pool. When
 * the deep book has not been fetched yet there is no honest way to place
 * myself in that queue, so this passes `1` (assume nothing ahead) rather
 * than inventing a number — the only other input, region volume, still
 * carries the interesting signal in that case. A TRUNCATED deep book is
 * used as-is here too: it under-counts the queue ahead of me (rather than
 * over-counting it), so `myShare` — and therefore the days-to-clear estimate
 * — reads as a lower bound in that case, never a false alarm.
 */
function computeSellThrough(
  row: OpenOrderRow,
  deep: RegionCompetition | null,
  history: PriceHistoryResult | null
): SellThrough {
  if (!history || history.points.length === 0) return { kind: 'unknown', reason: 'noHistory' };

  const recentDays = 30;
  const recent = filterPriceHistoryRange(history.points, '30d');
  const regionUnitsPerDay = recent.reduce((sum, p) => sum + p.volume, 0) / recentDays;

  let myShare = 1;
  if (deep) {
    const queueVolume = deep.competitors
      .filter(
        (c) =>
          c.orderId !== row.orderId &&
          c.isBuyOrder === row.isBuyOrder &&
          (row.isBuyOrder ? c.price >= row.price : c.price <= row.price)
      )
      .reduce((sum, c) => sum + c.volumeRemain, 0);
    const totalVolume = row.volumeRemain + queueVolume;
    myShare = totalVolume > 0 ? row.volumeRemain / totalVolume : 1;
  }

  return sellThrough({
    volumeRemain: row.volumeRemain,
    regionUnitsPerDay,
    myShare,
    hasHistory: true,
  });
}

export function OrderDetailModal({
  open,
  row,
  skills,
  deep,
  loadingDeep,
  history,
  stationChecked,
  stationsLoaded,
  regionJumps,
  stationNameFor,
  onCheckDeeper,
  onClose,
}: OrderDetailModalProps) {
  const { t } = useTranslation();
  const location: LocationState = !stationsLoaded
    ? 'unknown'
    : row.stationName === null
      ? 'structure'
      : 'known';

  const badge = orderBadgeFor(row);
  const station = stationScopeState(row, stationChecked, location);
  const system = deepScopeState('system', row, deep, location);
  const region = deepScopeState('region', row, deep, location);

  const sell = computeSellThrough(row, deep, history);
  const sellValue =
    sell.kind === 'known'
      ? `${sell.daysToClear}d`
      : t(
          sell.reason === 'noHistory'
            ? 'market.orders.sellsOutUnknown'
            : 'market.orders.sellsOutNoSales'
        );
  const sellPastExpiry =
    sell.kind === 'known' && row.expiry !== null && sell.daysToClear > row.expiry.daysLeft;

  const showCheckDeeper = deep === null && !loadingDeep;
  const allClean =
    !row.isBuyOrder &&
    station.kind === 'clear' &&
    (system.kind === 'clear' || system.kind === 'unavailable' || system.kind === 'notChecked') &&
    region.kind === 'clear';

  return (
    <Modal open={open} onClose={onClose} title={row.typeName} placement="wide">
      <div className="space-y-4">
        <section className="space-y-1">
          <h3 className="flex items-center gap-2 text-xs font-semibold tracking-widest text-text-dim uppercase">
            {t('market.orders.quickAnswer')}
            {badge && <OrderProblemBadge kind={badge.kind} detail={badge.detail} />}
          </h3>
          {badge ? (
            <>
              {/*
                The call first, at a size the eye lands on — the reason
                someone opened this modal is "what do I do about it", not
                "what does the badge mean". The explanation and the concrete
                numbers follow it.
              */}
              <p className="text-base font-semibold text-text">
                {t(`market.orders.badge.${badge.kind}Action`)}
              </p>
              <p className="text-sm text-text-dim">{t(`market.orders.badge.${badge.kind}Help`)}</p>
              <OrderRowSummaryText row={row} />
            </>
          ) : (
            <p className="text-sm text-text-dim">{t('market.orders.scopeNotChecked')}</p>
          )}
        </section>

        <div className="flex flex-wrap gap-2">
          <StatChip label={t('orders.price')} value={formatIsk(row.price, 2)} />
          <StatChip
            label={t('market.orders.floorLabel')}
            tooltip={t('market.orders.floorHelp')}
            value={row.floor ? formatIsk(row.floor.relist, 2) : t('common.unknown')}
            tone={row.floor && row.price < row.floor.relist ? 'danger' : 'default'}
          />
          <StatChip
            label={t('orders.remaining')}
            value={`${row.volumeRemain.toLocaleString()} / ${row.volumeTotal.toLocaleString()}`}
          />
          <StatChip
            label={t('market.orders.expiresIn')}
            value={row.expiry ? `${row.expiry.daysLeft}d` : t('common.unknown')}
            tone={row.expiry && row.expiry.daysLeft <= 7 ? 'warning' : 'default'}
          />
          <StatChip
            label={t('market.orders.sellsOutIn')}
            tooltip={t('market.orders.sellsOutHelp')}
            value={sellValue}
            tone={sellPastExpiry ? 'danger' : 'default'}
          />
        </div>
        {sellPastExpiry && (
          <p className="text-xs text-danger">{t('market.orders.sellsOutPastExpiry')}</p>
        )}

        <section className="space-y-1 border-t border-line pt-3">
          <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
            {t('market.orders.whoIsCheaper')}
          </h3>
          <div className="grid grid-cols-[6rem_1fr_auto] gap-x-3 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase md:grid-cols-[6rem_1fr_auto_auto_auto]">
            <span />
            <span />
            <span>{t('market.orders.scopeTheirPrice')}</span>
            <span className="hidden md:inline">{t('market.orders.scopeOverBy')}</span>
            <span className="hidden md:inline">{t('market.orders.scopeDistance')}</span>
          </div>
          <ScopeRow
            label={t('market.orders.badge.undercutStation')}
            state={station}
            stationName={row.stationName}
            distance={t('market.orders.scopeSameStation')}
          />
          <ScopeRow
            label={t('market.orders.badge.undercutSystem')}
            state={system}
            stationName={
              system.kind === 'rival' ? stationNameFor(system.rival.locationId) : undefined
            }
            distance={t('market.orders.scopeSameSystem')}
          />
          <ScopeRow
            label={t('market.orders.badge.undercutRegion')}
            state={region}
            stationName={
              region.kind === 'rival' ? stationNameFor(region.rival.locationId) : undefined
            }
            jumps={regionJumps}
          />
          {/* My own order last, as the line every row above is measured against. */}
          <div className="grid grid-cols-[6rem_1fr_auto] gap-x-3 border-t border-line bg-panel-2 py-1.5 text-xs md:grid-cols-[6rem_1fr_auto_auto_auto]">
            <span className="font-semibold tracking-widest text-accent uppercase">
              {t('market.orders.scopeMyOrder')}
            </span>
            <span>{row.stationName ?? t('market.unknownStructure')}</span>
            <span className="tabular-nums">{formatIsk(row.price, 2)}</span>
            <span className="hidden md:inline" />
            <span className="hidden md:inline" />
          </div>
          {allClean && <p className="text-xs text-success">{t('market.orders.onlySeller')}</p>}
          {deep?.truncated && (
            // A truncated fetch isn't the pre-fetch state (the button above
            // stays hidden, same as any other resolved `deep`) — say why
            // system/region above read "not checked" instead of leaving the
            // user to wonder where the "check deeper" button went. Same
            // key/shape `OrderHistoryPanel.tsx` and `VariationsTable.tsx` use
            // for their own truncated fetches.
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.incompleteTitle')}</p>
          )}
          {showCheckDeeper && (
            <Button size="sm" onClick={onCheckDeeper}>
              {t('market.orders.checkDeeper')}
            </Button>
          )}
          {loadingDeep && (
            <p className="text-xs text-text-dim">{t('market.orders.checkingDeeper')}</p>
          )}
        </section>

        <section className="space-y-1.5 border-t border-line pt-3">
          <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
            {t('market.orders.floorWorking')}
          </h3>
          {row.costBasis === null ? (
            <div className="space-y-1">
              <p className="text-sm text-text">{t('market.orders.noCostBasisTitle')}</p>
              <p className="text-xs text-text-dim">{t('market.orders.noCostBasisHint')}</p>
              <Link to="/industry" className={buttonClassName({ variant: 'ghost', size: 'sm' })}>
                {t('market.orders.linkBuild')}
              </Link>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <LedgerRow
                label={t('industry.quantity')}
                value={row.costBasis.runQuantity.toLocaleString()}
              />
              <LedgerRow
                label={t('industry.materialCost')}
                value={`${formatIsk(row.costBasis.materialCost)} ISK`}
              />
              <LedgerRow
                label={t('industry.jobFee')}
                value={`${formatIsk(row.costBasis.jobFee)} ISK`}
              />
              <LedgerRow
                label={t('industry.totalCost')}
                value={`${formatIsk(row.costBasis.materialCost + row.costBasis.jobFee)} ISK`}
              />
              {/*
                Per unit, not per run — the pivot from the batch totals above
                to the per-unit figures below. `unitCost` is exactly
                `totalCost / runQuantity` (orderCostBasis.ts); 2 decimals to
                match the floor rows it feeds into, not the 0-decimal batch
                totals above it.
              */}
              <LedgerRow
                label={t('market.orders.costPerUnit')}
                value={`${formatIsk(row.costBasis.unitCost, 2)} ISK`}
              />
              {/*
                Rendered as ISK off `floor.relist`, not as a bare percentage:
                `unitCost + salesTax(relist) + brokerFee(relist) === relist`
                by construction (`breakEvenPrice` solves for exactly that
                revenue), including its 100 ISK minimum-broker-fee floor —
                which a percentage-of-unitCost readout would silently miss.
                This is what makes the ledger's lines actually sum to the
                floor shown below, so gated on `row.floor` (not `skills`
                alone): there is no relist price to read the fee off without it.
              */}
              {skills && row.floor && (
                <>
                  <LedgerRow
                    label={t('industry.salesTax')}
                    value={`${formatIsk(salesTax(row.floor.relist, skills.accountingLevel), 2)} ISK`}
                  />
                  <LedgerRow
                    label={t('industry.brokerFee')}
                    value={`${formatIsk(brokerFee(row.floor.relist, skills.brokerRelationsLevel), 2)} ISK`}
                  />
                </>
              )}
              {row.floor && (
                // Only ONE floor is ever shown on screen (design decision):
                // `floor.fill` — what leaving the order alone would net once
                // it sells — is explained inside the `floorHelp` tooltip on
                // the headline stat chip above, never as a second visible
                // number here.
                <LedgerRow
                  label={t('market.orders.floorLabel')}
                  value={`${formatIsk(row.floor.relist, 2)} ISK`}
                />
              )}
            </dl>
          )}
        </section>
      </div>
    </Modal>
  );
}

function LedgerRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-dim uppercase tracking-widest font-semibold">{label}</dt>
      <dd className="text-right tabular-nums text-text">{value}</dd>
    </>
  );
}
