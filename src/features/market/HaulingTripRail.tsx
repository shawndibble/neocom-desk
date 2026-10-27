/**
 * The trip rail and its parts: a sticky column beside the
 * Hauling table that holds the Trip Plan's totals, the fill offer and Copy
 * multibuy, and swaps to a selected row's detail with a "‹ Trip" crumb. On a
 * panel too narrow for it, `HaulingTripBar` is the sticky bottom bar instead.
 * Presentational: the panel owns every value and handler.
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, LiveStatus, Panel, ProgressBar, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  focusRingClassName,
  inlineLinkClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import { FILL_BATCH_CAP, type HaulingFillStopReason } from '@/engine/market/haulingFillStop';
import { holdsCapacityM3, holdsUsedM3, type TripPlan } from '@/engine/market/haulingPlan';
import { ROUTE_PREFERENCE_LABEL_KEYS } from '@/features/route/routePreferences';
import { formatIsk, formatIskCompactSigned } from '@/lib/isk';
import { useStickyClearance } from '@/lib/useStickyClearance';
import { formatTripM3, shownUsedM3 } from './format';
import { HaulingHoldMeters } from './HaulingHoldMeters';
import { IskDelta } from '@/components/ui/IskDelta';
import { iskTone, signedIsk } from '@/lib/signedIsk';
import type { HaulingFillScanState } from './useHaulingFillScan';
import { useHubJumps } from './useHubJumps';

const isk = (value: number) => formatIsk(value, 0);
const signed = (value: number) => signedIsk(value, 0);

/** Literal keys, so the locale split finds them. */
const BINDING_KEYS = {
  sales: 'market.hauling.rail.limitedSales',
  space: 'market.hauling.rail.limitedSpace',
  budget: 'market.hauling.rail.limitedBudget',
} as const satisfies Record<NonNullable<TripPlan['binding']>, string>;

export interface HaulingTripRailProps {
  /** The selected row's detail; null shows the trip. */
  detail: ReactNode | null;
  /** Leaves the detail for the trip (the "‹ Trip" crumb); does not clear the table's selection. */
  onBack: () => void;
  /** The trip view: `HaulingTripSummary` and `HaulingFillList`. */
  trip: ReactNode;
  /** Always shown under both views: free m³, profit, Copy multibuy and the table menu. */
  footer: ReactNode;
  /** Names the shown detail (the selected row's type id), so picking another row scrolls back to its top. */
  detailKey?: string | number;
}

/** Capped at the viewport's height so the crumb and footer stay on screen; the body scrolls inside. */
export function HaulingTripRail({ detail, onBack, trip, footer, detailKey }: HaulingTripRailProps) {
  const { t } = useTranslation();
  const showingDetail = detail !== null;
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasShowingDetail = useRef(showingDetail);

  useEffect(() => {
    const body = bodyRef.current;
    const leftDetail = wasShowingDetail.current && !showingDetail;
    wasShowingDetail.current = showingDetail;
    if (!body) return;
    body.scrollTop = 0;
    // The crumb unmounts on its own click and focus drops to the page; land it on the trip.
    // Focus still on a table row (the row deselected there) stays put.
    const active = document.activeElement;
    if (leftDetail && (!active || active === document.body || !active.isConnected)) {
      body.focus({ preventScroll: true });
    }
  }, [showingDetail, detailKey]);

  return (
    <Panel
      padded={false}
      fill
      title={showingDetail ? undefined : t('market.hauling.rail.title')}
      leading={
        showingDetail ? (
          <button
            type="button"
            onClick={onBack}
            className={`${inlineLinkClassName} ${tappableRowClassName} inline-flex items-center gap-1 px-2 text-sm`}
          >
            <Icon.Back aria-hidden="true" size={Icon.ICON_SIZE.sm} />
            {t('market.hauling.rail.title')}
          </button>
        ) : undefined
      }
      className="sticky top-4 flex max-h-[calc(100dvh-2rem)] flex-col self-start"
    >
      <div ref={bodyRef} tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto p-3 outline-none">
        {showingDetail ? detail : trip}
      </div>
      <div className="shrink-0 border-t border-line p-3">{footer}</div>
    </Panel>
  );
}

export interface HaulingTripSummaryProps {
  plan: TripPlan;
  /** False until the user has chosen a Cargo Space: no meter, no free m³, the cargo prompt instead. */
  cargoSet: boolean;
  /** "Amarr to Jita"; null with Any hub at an end. */
  laneLabel: string | null;
  /** The lane's two Trade Hub systems, for the jump count; null with Any hub at an end. */
  fromSystemId: number | null;
  toSystemId: number | null;
  /** The panel's `HaulingCargoControl`. */
  cargoControl: ReactNode;
  /** Cargo value (plan spend) once the ticked fill items are added; null with nothing ticked. */
  cargoValueAfterFill: number | null;
  /** The free m³ to print: the same figure the fill offer and the trip bar show. */
  freeM3: number;
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm tabular-nums">
      <dt className="text-text-dim">{label}</dt>
      <dd className="ml-auto text-right">{children}</dd>
    </div>
  );
}

export function HaulingTripSummary({
  plan,
  cargoSet,
  laneLabel,
  fromSystemId,
  toSystemId,
  cargoControl,
  cargoValueAfterFill,
  freeM3,
}: HaulingTripSummaryProps) {
  const { t } = useTranslation();
  // Here, not in the panel: route data loads only once the trip shows.
  const jumps = useHubJumps(fromSystemId, toSystemId);
  const { profit, cost } = plan.totals;
  const holds = cargoSet ? plan.holds : [];
  const capacityM3 = holdsCapacityM3(holds);
  const usedM3 = holdsUsedM3(holds);
  const knownJumps = jumps.status === 'known' && jumps.jumps > 0 ? jumps : null;

  const jumpsText = knownJumps
    ? t('market.hauling.rail.jumps', {
        count: knownJumps.jumps,
        preference: t(ROUTE_PREFERENCE_LABEL_KEYS[knownJumps.preference]),
      })
    : null;

  return (
    <div className="flex flex-col gap-4">
      {laneLabel !== null && (
        <p className="text-xs text-text-dim">
          {jumpsText
            ? t('market.hauling.rail.laneJumps', { lane: laneLabel, jumps: jumpsText })
            : laneLabel}
        </p>
      )}

      <div className="flex flex-col gap-1">
        {cargoControl}
        {/* What the load is worth: the figure a ganker weighs. */}
        <span className="flex flex-col text-xs text-text-dim tabular-nums">
          <span>
            {t('market.hauling.rail.cargoValue')} <b className="text-text">{isk(cost)}</b>
          </span>
          {/* Only when the fill changes the figure as shown. */}
          {cargoValueAfterFill !== null && isk(cargoValueAfterFill) !== isk(cost) && (
            <span>
              {t('market.hauling.rail.cargoValueAfter', { value: isk(cargoValueAfterFill) })}
            </span>
          )}
        </span>
      </div>

      {holds.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-3xl leading-none font-semibold tabular-nums">
            {t('market.hauling.rail.m3', { m3: formatTripM3(freeM3) })}{' '}
            <span className="text-base font-normal text-text-dim">
              {t('market.hauling.rail.freeWord')}
            </span>
          </span>
          {holds.length === 1 && holds[0]!.kind === 'general' ? (
            <ProgressBar
              label={t('market.hauling.rail.holdLabel')}
              value={usedM3}
              max={capacityM3}
              size="md"
            />
          ) : (
            <HaulingHoldMeters holds={holds} />
          )}
          <span className="text-xs text-text-dim tabular-nums">
            {t('market.hauling.rail.used', {
              used: formatTripM3(shownUsedM3(holds)),
              total: formatTripM3(capacityM3),
            })}
          </span>
        </div>
      ) : (
        <p className="text-xs text-text-dim">{t('market.hauling.cargo.tip')}</p>
      )}

      <dl className="flex flex-col gap-1 border-t border-line pt-3">
        <SummaryRow label={t('market.hauling.rail.profit')}>
          <IskDelta amount={profit} decimals={0} className="font-semibold" />
        </SummaryRow>
        <SummaryRow label={t('market.hauling.rail.spend')}>{isk(cost)}</SummaryRow>
        {knownJumps && (
          <SummaryRow label={t('market.hauling.rail.perJump', { jumps: knownJumps.jumps })}>
            {signed(profit / knownJumps.jumps)}
          </SummaryRow>
        )}
      </dl>

      {plan.binding !== null && (
        <p className="text-xs text-text-dim">{t(BINDING_KEYS[plan.binding])}</p>
      )}
    </div>
  );
}

export interface HaulingFillItem {
  typeId: number;
  name: string;
  /** The Hauling category it comes from ("Fuel Blocks"). */
  categoryName: string;
  quantity: number;
  volumeM3: number;
  cost: number;
  profit: number;
}

export type HaulingFillStatus = HaulingFillScanState['status'];

/** Literal keys, so the locale split finds them. */
const STOP_KEYS = {
  full: 'market.hauling.fill.stopped.full',
  'nothing-left': 'market.hauling.fill.stopped.nothingLeft',
  'no-gain': 'market.hauling.fill.stopped.noGain',
  budget: 'market.hauling.fill.stopped.budget',
  'batch-cap': 'market.hauling.fill.stopped.batchCap',
  stopped: 'market.hauling.fill.stopped.byYou',
} as const satisfies Record<HaulingFillStopReason, string>;
/** With a Max price set, "nothing else" is only true under it. */
const UNDER_MAX_PRICE_KEYS = {
  'nothing-left': 'market.hauling.fill.stopped.nothingLeftUnderMax',
  'no-gain': 'market.hauling.fill.stopped.noGainUnderMax',
} as const satisfies Partial<Record<HaulingFillStopReason, string>>;

export interface HaulingFillListProps {
  /** Free m³ in the plan as it stands. */
  freeM3: number;
  status: HaulingFillStatus;
  /** The batch running while `loading`, counted from Find. */
  batch: number;
  /** Free m³ once everything found so far is planned, while `loading`; null before the first batch lands. */
  runningFreeM3: number | null;
  /** The stage line of the batch running. */
  progressText?: string;
  /** Why the batches stopped, once `ready`. */
  reason: HaulingFillStopReason | null;
  /** A Max price is set. */
  underMaxPrice: boolean;
  /** Free m³ once every offered item is in: "Filled: 120 m³ left." */
  leftM3: number;
  /** Offers Find more: the hold is not full and something may be left. */
  canFindMore: boolean;
  /** What the last Add loaded; it replaces the stop reason until the next Find or Find more. */
  added: { count: number; volumeM3: number } | null;
  /** Best profit per m³ first. */
  items: readonly HaulingFillItem[];
  ticked: ReadonlySet<number>;
  onToggle: (typeId: number, ticked: boolean) => void;
  /** Starts the batches afresh. */
  onFind: () => void;
  /** Carries on from where they stopped: Find more, and Try again after a failed batch. */
  onMore: () => void;
  /** Ends the batches, keeping what was found. */
  onStop: () => void;
  /** Adds the ticked items to the Trip Plan. */
  onAdd: () => void;
  /** Totals of the ticked items. */
  tickedTotals: { count: number; volumeM3: number; cost: number; profit: number };
  /** The hold once the ticked items are added; null without a Cargo Space. */
  holdAfter: { usedM3: number; capacityM3: number; freeM3: number } | null;
}

function FillRow({
  item,
  ticked,
  onToggle,
}: {
  item: HaulingFillItem;
  ticked: boolean;
  onToggle: HaulingFillListProps['onToggle'];
}) {
  const { t } = useTranslation();
  const nameId = useId();
  return (
    <li className="border-t border-line/60">
      <label
        className={`flex cursor-pointer items-center gap-2 py-1 text-xs tabular-nums ${tappableRowClassName}`}
      >
        <Checkbox
          aria-labelledby={nameId}
          checked={ticked}
          onChange={(event) => onToggle(item.typeId, event.target.checked)}
        />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span id={nameId} className="line-clamp-2 break-words">
            {item.name}
          </span>
          {/* m³ first, untruncatable: only the category gives way. */}
          <span className="flex min-w-0 gap-1 text-text-dim">
            <span className="shrink-0">
              {t('market.hauling.rail.m3', { m3: formatTripM3(item.volumeM3) })}
            </span>
            {item.categoryName && <span className="truncate">· {item.categoryName}</span>}
          </span>
        </span>
        <IskDelta amount={item.profit} decimals={0} className="shrink-0" />
      </label>
    </li>
  );
}

export function HaulingFillList({
  freeM3,
  status,
  batch,
  runningFreeM3,
  progressText,
  reason,
  underMaxPrice,
  leftM3,
  canFindMore,
  added,
  items,
  ticked,
  onToggle,
  onFind,
  onMore,
  onStop,
  onAdd,
  tickedTotals,
  holdAfter,
}: HaulingFillListProps) {
  const { t } = useTranslation();
  const addDetailId = useId();
  // A finished run's result (stop sentence, Add) and Add's "Added …" line land below the fold in a long rail: bring them in.
  const endRef = useRef<HTMLDivElement>(null);
  const outcomeRef = useRef<HTMLParagraphElement>(null);
  const ran = useRef(false);
  useEffect(() => {
    if (status === 'loading') ran.current = true;
    else if (ran.current) {
      ran.current = false;
      endRef.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [status]);
  useEffect(() => {
    if (added !== null) outcomeRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [added]);

  let outcome: string | null = null;
  if ((status === 'ready' || status === 'error') && added !== null) {
    outcome = t('market.hauling.fill.added', {
      count: added.count,
      m3: formatTripM3(added.volumeM3),
      free: formatTripM3(freeM3),
    });
  } else if (status === 'ready' && reason !== null) {
    const key =
      underMaxPrice && (reason === 'nothing-left' || reason === 'no-gain')
        ? UNDER_MAX_PRICE_KEYS[reason]
        : STOP_KEYS[reason];
    outcome = t(key, { m3: formatTripM3(leftM3), count: FILL_BATCH_CAP });
  }

  let body: ReactNode;
  if (status === 'idle') {
    body = (
      <>
        <Button className="w-full" onClick={onFind}>
          {t('market.hauling.fill.find')}
        </Button>
        <p className="text-xs text-text-dim">
          {t('market.hauling.fill.findNote', { m3: formatTripM3(freeM3) })}
        </p>
      </>
    );
  } else if (status === 'loading') {
    const running = t('market.hauling.fill.running', {
      batch,
      m3: formatTripM3(runningFreeM3 ?? freeM3),
    });
    body = (
      <div className="flex flex-col gap-1 text-xs text-text-dim">
        <div className="flex items-center gap-2">
          <Spinner size="sm" label={running} />
          <span aria-hidden="true" className="min-w-0 flex-1 tabular-nums">
            {running}
          </span>
          <Button onClick={onStop}>{t('market.hauling.fill.stop')}</Button>
        </div>
        {/* Its own line, the rail's full width: beside Stop it wrapped. */}
        {progressText && <span aria-hidden="true">{progressText}</span>}
      </div>
    );
  } else {
    // Ready, or a failed batch: what earlier batches found stays on offer either way.
    body = (
      <>
        {status === 'error' && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xs border border-warning/45 bg-warning/10 p-2 text-xs"
          >
            <p className="text-warning">{t('market.hauling.fill.error')}</p>
            <Button size="sm" className="self-start" onClick={onMore}>
              {t('market.hauling.retry')}
            </Button>
          </div>
        )}
        {items.length > 0 && (
          <>
            <ul aria-label={t('market.hauling.fill.listLabel')} className="flex flex-col">
              {items.map((item) => (
                <FillRow
                  key={item.typeId}
                  item={item}
                  ticked={ticked.has(item.typeId)}
                  onToggle={onToggle}
                />
              ))}
            </ul>
            <div className="flex flex-col gap-1">
              <Button
                className="w-full"
                disabled={tickedTotals.count === 0}
                onClick={onAdd}
                aria-describedby={addDetailId}
              >
                {t('market.hauling.fill.add', {
                  count: tickedTotals.count,
                  m3: formatTripM3(tickedTotals.volumeM3),
                })}
              </Button>
              <p id={addDetailId} className="text-center text-xs text-text-dim tabular-nums">
                {t('market.hauling.fill.addDetail', {
                  spend: isk(tickedTotals.cost),
                  profit: signed(tickedTotals.profit),
                })}
              </p>
            </div>
            {holdAfter && (
              <p className="text-xs text-text-dim tabular-nums">
                {t('market.hauling.fill.holdAfter', {
                  used: formatTripM3(holdAfter.usedM3),
                  total: formatTripM3(holdAfter.capacityM3),
                  free: formatTripM3(holdAfter.freeM3),
                })}
              </p>
            )}
          </>
        )}
        {outcome && (
          <p ref={outcomeRef} className="text-xs text-text-dim tabular-nums">
            {outcome}
          </p>
        )}
        {canFindMore && (
          <Button className="w-full" onClick={onMore}>
            {t('market.hauling.fill.more')}
          </Button>
        )}
        <div ref={endRef} aria-hidden="true" className="-mt-2" />
      </>
    );
  }

  return (
    <section className="flex flex-col gap-2 border border-line bg-panel-2 p-3">
      <h3 className="text-sm font-semibold">{t('market.hauling.fill.title')}</h3>
      {/* Always mounted, so the stop reason and Add's result are read out when they land. */}
      <LiveStatus>{outcome}</LiveStatus>
      {body}
    </section>
  );
}

export interface HaulingTripBarProps {
  /** Null without a Cargo Space. */
  freeM3: number | null;
  profit: number;
  /** Opens the trip (summary + fill) as a sheet. */
  onOpenTrip: () => void;
  /** The panel's Copy multibuy button: the bar's one boxed control, `variant="primary"`, `size="sm"`. */
  copyButton: ReactNode;
}

/**
 * Pinned above the phone tab bar; at md+, where there is none, flush with the bottom (plus the safe area).
 * Publishes `--hauling-trip-bar-clearance`; `index.css` must sum it into
 * `--sticky-clearance` for focused controls to scroll clear (WCAG 2.4.11).
 */
export function HaulingTripBar({ freeM3, profit, onOpenTrip, copyButton }: HaulingTripBarProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useStickyClearance(ref, 'hauling-trip-bar');
  const profitText = formatIskCompactSigned(profit);
  return (
    <div
      ref={ref}
      role="region"
      aria-label={t('market.hauling.rail.title')}
      className="sticky bottom-[var(--bottom-nav-clearance)] z-30 flex items-center gap-2 rounded-xs border border-line-bright bg-panel p-2 shadow-lg md:bottom-[env(safe-area-inset-bottom)]"
    >
      {/* The whole summary opens the trip, so its figures stay plain text (nothing tabbable inside a button). */}
      <button
        type="button"
        onClick={onOpenTrip}
        className={`flex min-w-0 flex-1 flex-col items-start rounded-xs px-1 text-left ${tappableRowClassName} ${focusRingClassName}`}
      >
        <span className="max-w-full truncate text-sm font-semibold whitespace-nowrap tabular-nums">
          {freeM3 !== null && (
            <>{t('market.hauling.tripBar.free', { m3: formatTripM3(freeM3) })} · </>
          )}
          <span className={iskTone(profit, 0)}>{profitText}</span>
        </span>
        <span className="text-xs text-accent">{t('market.hauling.tripBar.details')}</span>
      </button>
      {copyButton}
    </div>
  );
}
