/**
 * Full breakdown of one open order (CONTEXT.md's redesigned Market > Open
 * Orders tab): what to do about it, the numbers behind that call, who is
 * cheaper and where, and — for a sell order — the cost-basis ledger the
 * floor came from.
 *
 * Kept dumb on purpose: every prop is already-loaded data plus loading flags.
 * `OpenOrdersPanel` owns every fetch (`ensureDeepChecked`, jump lookups) —
 * this component only renders what it is handed and asks for more via
 * `onCheckDeeper`.
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
import type { CharacterSkills, OpenOrderRow } from './openOrdersModel';
import type { RegionCompetition } from './orderCompetition';
import { OrderProblemBadge } from './OrderProblemBadge';
import { orderBadgeFor } from './orderBadgeKind';

export interface OrderDetailModalProps {
  open: boolean;
  row: OpenOrderRow;
  /** Undefined only if the character's own skills failed to load — the ledger still renders, just without tax/broker lines. */
  skills: CharacterSkills | undefined;
  /** Null: not fetched yet (or the fetch failed and hasn't been retried). */
  deep: RegionCompetition | null;
  loadingDeep: boolean;
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
  return rival ? { kind: 'rival', rival } : { kind: 'clear' };
}

function ScopeRow({
  label,
  state,
  jumps,
}: {
  label: string;
  state: ScopeState;
  jumps?: JumpsAwayResult;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-sm">
      <span className="font-semibold tracking-widest text-text-dim uppercase">{label}</span>
      <span className="tabular-nums">
        {state.kind === 'unavailable' && (
          <span className="text-text-dim">{t('market.orders.structureMarketUnavailable')}</span>
        )}
        {state.kind === 'notChecked' && (
          <span className="text-text-dim">{t('market.orders.scopeNotChecked')}</span>
        )}
        {state.kind === 'clear' && (
          <span className="text-success">{t('market.orders.scopeClear')}</span>
        )}
        {state.kind === 'rival' && (
          <span className="text-danger">
            {formatIsk(state.rival.price, 2)} ISK (-{state.rival.gapPct.toFixed(1)}%)
            {jumps && (
              <>
                {' · '}
                <JumpsAwayText result={jumps} t={t} />
              </>
            )}
          </span>
        )}
      </span>
    </div>
  );
}

export function OrderDetailModal({
  open,
  row,
  skills,
  deep,
  loadingDeep,
  stationChecked,
  stationsLoaded,
  regionJumps,
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
              <p className="text-sm text-text">{t(`market.orders.badge.${badge.kind}Help`)}</p>
              <p className="text-xs text-text-dim">
                {t(`market.orders.badge.${badge.kind}Action`)}
              </p>
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
        </div>

        <section className="space-y-1 border-t border-line pt-3">
          <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
            {t('market.orders.whoIsCheaper')}
          </h3>
          <ScopeRow label={t('market.orders.badge.undercutStation')} state={station} />
          <ScopeRow label={t('market.orders.badge.undercutSystem')} state={system} />
          <ScopeRow
            label={t('market.orders.badge.undercutRegion')}
            state={region}
            jumps={regionJumps}
          />
          {allClean && <p className="text-xs text-success">{t('market.orders.onlySeller')}</p>}
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
                <>
                  <LedgerRow
                    label={t('market.orders.floorLabel')}
                    value={`${formatIsk(row.floor.relist, 2)} ISK`}
                  />
                  <LedgerRow
                    label={t('market.orders.floorFillLabel')}
                    value={`${formatIsk(row.floor.fill, 2)} ISK`}
                  />
                </>
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
