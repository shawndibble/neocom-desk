import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Caret, Checkbox, Toast, buttonClassName } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  focusRingInsetClassName,
  inlineLinkClassName,
  rowInteractiveClassName,
  touchCheckboxLabelClassName,
} from '@/components/ui/controlStyles';
import {
  heldItems,
  legHold,
  legCondition,
  legStopAction,
  legWaypointIds,
  sectionWaypointIds,
  splitPlaceName,
  type LegCondition,
  type StopAction,
} from '@/engine/route/haulLeg';
import type { HaulLeg, HaulSection, HaulStack } from '@/engine/route/haulPlan';
import {
  currentLeg,
  legAtSystem,
  remainingLegs,
  remainingTotals,
  sectionStart,
  tickLeg,
  untickLeg,
} from '@/engine/route/haulProgress';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { formatCubicMetres } from '@/lib/volume';
import { legRouteHref, sectionRouteHref, type ActiveHaul, type ReplanResult } from './activeHaul';
import { HaulStrip } from './HaulStrip';
import { HaulWaypointButton } from './HaulWaypointButton';
import { useHaulLegRows, type LegRows } from './useHaulLegRows';

interface ActiveHaulViewProps {
  haul: ActiveHaul;
  onBack: () => void;
  onClear: () => Promise<void>;
  /** Saves the ticked Leg ids on the snapshot. */
  onProgress: (done: number[]) => void | Promise<void>;
  /** Re-optimises what is left from where the pilot is; the caller saves a new snapshot. */
  onReplan: () => Promise<ReplanResult>;
  /** The pilot's Current System; offers a tick, never makes one. */
  currentSystemId?: number | null;
}

/**
 * The active haul as a timeline, one section per Character: stops down a rail
 * and a block per Leg between them, with its distance, the security it flies
 * through (a strip with per-system kills), a done tick, waypoint and Route
 * Safety actions, and its cargo folded away (open on the next Leg). Route
 * Safety is the analyser; a Leg states the condition it flies through and
 * links there, so nothing here judges a route.
 */
export function ActiveHaulView({
  haul,
  onBack,
  onClear,
  onProgress,
  onReplan,
  currentSystemId = null,
}: ActiveHaulViewProps) {
  const { t } = useTranslation();
  const { plan, destination } = haul;
  const done = haul.doneLegIds ?? [];
  // Memoised on the plan: the hook's effect re-runs when this array's identity changes.
  const allLegs = useMemo(() => plan.sections.flatMap((s) => s.legs), [plan]);
  const legRows = useHaulLegRows(allLegs);
  // Each section's current Leg shows its cargo and the rest fold; a toggle flips that.
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [marked, setMarked] = useState<{ n: number; before: number[] } | null>(null);
  const [replanNote, setReplanNote] = useState<string | null>(null);
  const [replanning, setReplanning] = useState(false);
  const toggle = (key: string) =>
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const currentIds = new Set(
    plan.sections.flatMap((s) => {
      const leg = currentLeg(s, done);
      return leg ? [leg.id] : [];
    })
  );
  const tick = (leg: HaulLeg, n: number, checked: boolean) => {
    setFlipped(new Set());
    if (checked) {
      setMarked({ n, before: done });
      void onProgress(tickLeg(plan, done, leg.id));
    } else {
      setMarked(null);
      void onProgress(untickLeg(plan, done, leg.id));
    }
  };
  const totals = remainingTotals(plan, done);
  const finished = plan.totals.legs > 0 && totals.legs === 0;
  const here = legAtSystem(plan, done, currentSystemId);
  const hereN = here
    ? (plan.sections.find((s) => s.characterId === here.characterId)?.legs.indexOf(here) ?? -1) + 1
    : 0;
  const replan = async () => {
    setReplanning(true);
    const result = await onReplan().finally(() => setReplanning(false));
    setMarked(null);
    setFlipped(new Set());
    setReplanNote(
      result.status === 'loaded'
        ? t('assets.movePlan.haul.replanLoaded', { names: result.names.join(', ') })
        : result.status === 'unknown'
          ? t('assets.movePlan.haul.replanFailed')
          : null
    );
  };
  const jumpsLabel = (count: number) => t('assets.movePlan.haul.jumpCount', { count });

  return (
    <div className="flex flex-1 flex-col gap-3">
      <h3 tabIndex={-1} className="m-0 text-base font-bold focus:outline-none">
        {t('assets.movePlan.haul.title')}
      </h3>
      <p className="m-0 text-sm text-text-dim tabular-nums">
        {t(
          totals.m3 > 0 ? 'assets.movePlan.haul.summary' : 'assets.movePlan.haul.summaryShipsOnly',
          {
            legs: t('assets.movePlan.haul.legCount', { count: totals.legs }),
            jumps: jumpsLabel(totals.jumps),
            volume: formatCubicMetres(totals.m3),
            destination: destination.name,
          }
        )}
      </p>
      {here && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xs border border-line-bright px-3 py-2 text-sm">
          <span>{t('assets.movePlan.haul.hereAsk', { n: hereN, place: here.to.name })}</span>
          <Button size="sm" onClick={() => tick(here, hereN, true)}>
            {t('assets.movePlan.haul.hereMark')}
          </Button>
        </div>
      )}
      {finished && <p className="m-0 text-sm">{t('assets.movePlan.haul.finished')}</p>}
      {replanNote && (
        <p role="status" className="m-0 text-sm text-warning">
          {replanNote}
        </p>
      )}
      {plan.sections.map((section) => (
        <Section
          key={section.characterId}
          section={section}
          done={done}
          currentIds={currentIds}
          flipped={flipped}
          onToggle={toggle}
          onTick={tick}
          many={plan.sections.length > 1}
          legRows={legRows}
          capacityM3={haul.capacityM3}
        />
      ))}
      {plan.sections.length === 0 && (
        <p className="m-0 text-text-dim">{t('assets.movePlan.haul.noLegs')}</p>
      )}
      {plan.leftOut.length > 0 && (
        <section className="flex flex-col gap-1 rounded-xs border border-warning/60 px-3 py-2">
          <h4 className="m-0 text-sm font-semibold text-warning">
            {t('assets.movePlan.haul.leftOutTitle')}
          </h4>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
            {plan.leftOut.map((l) => (
              <li key={`${l.characterId}:${l.locationId}`}>
                {t(`assets.movePlan.haul.leftOut_${l.reason}`, {
                  name: l.name,
                  place: l.place,
                  volume: formatCubicMetres(l.m3),
                })}
              </li>
            ))}
          </ul>
        </section>
      )}
      {plan.flown.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-text-dim">
          {plan.flown.map((f) => (
            <li key={f.characterId}>
              {t('assets.movePlan.haul.flown', { name: f.name, ships: f.ships.join(', ') })}
            </li>
          ))}
        </ul>
      )}
      {marked && (
        <Toast
          message={t('assets.movePlan.haul.marked', { n: marked.n })}
          undo={{
            label: t('assets.movePlan.haul.undo'),
            onUndo: () => {
              setMarked(null);
              void onProgress(marked.before);
            },
          }}
          onClose={() => setMarked(null)}
        />
      )}
      <div className="sticky -bottom-3 mt-auto -mx-3 -mb-3 flex flex-wrap justify-end gap-2 border-t border-line bg-panel px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
        {done.length > 0 && !finished && (
          <Button variant="ghost" disabled={replanning} onClick={() => void replan()}>
            {t('assets.movePlan.haul.replan')}
          </Button>
        )}
        {done.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => {
              setMarked(null);
              void onProgress([]);
            }}
          >
            {t('assets.movePlan.haul.resetProgress')}
          </Button>
        )}
        <Button variant="danger" onClick={() => setClearing(true)}>
          {t('assets.movePlan.haul.clear')}
        </Button>
        <Button variant="ghost" onClick={onBack}>
          {t('assets.movePlan.back')}
        </Button>
      </div>
      <ConfirmDialog
        open={clearing}
        title={t('assets.movePlan.haul.clearTitle')}
        body={t('assets.movePlan.haul.clearBody')}
        actionLabel={t('assets.movePlan.haul.clear')}
        cancelLabel={t('assets.movePlan.cancel')}
        onConfirm={async () => {
          await onClear();
          setClearing(false);
        }}
        onClose={() => setClearing(false)}
      />
    </div>
  );
}

const TONE: Record<LegCondition['kind'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  highsec: 'success',
  lowsec: 'warning',
  nullsec: 'danger',
  unknown: 'neutral',
};

function Section({
  section,
  done,
  currentIds,
  flipped,
  onToggle,
  onTick,
  many,
  legRows,
  capacityM3,
}: {
  section: HaulSection;
  done: readonly number[];
  currentIds: ReadonlySet<number>;
  flipped: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onTick: (leg: HaulLeg, n: number, checked: boolean) => void;
  many: boolean;
  legRows: ReadonlyMap<number, LegRows>;
  capacityM3: number;
}) {
  const { t } = useTranslation();
  const { legs } = section;
  const first = legs[0];
  const left = remainingLegs(section, done);
  const routeHref = sectionRouteHref(left, sectionStart(section, done));
  return (
    <section
      aria-label={many ? section.name : t('assets.movePlan.haul.legsLabel')}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {many ? (
          <h4 className="m-0 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold">
            {section.name}
            <span className="text-xs font-normal text-text-dim">
              {t('assets.movePlan.haul.tripCount', { count: section.trips })}
            </span>
          </h4>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-3">
          <HaulWaypointButton
            characterId={section.characterId}
            ids={sectionWaypointIds(left)}
            label={t('assets.movePlan.haul.waypointAll')}
            doneLabel={t('assets.movePlan.haul.waypointAllDone')}
            variant={many ? 'ghost' : 'primary'}
          />
          {routeHref && (
            <Link className={buttonClassName({ size: 'sm' })} to={routeHref}>
              {t('assets.movePlan.haul.routeSafetyAll')}
            </Link>
          )}
        </div>
      </div>
      <div className="ml-2 border-l-2 border-line-bright/55">
        {first && (
          <Stop name={first.from?.name ?? t('assets.movePlan.haul.startUnknown')} start done />
        )}
        <ol className="m-0 flex list-none flex-col p-0">
          {legs.map((leg, index) => (
            <li key={leg.id} data-leg-id={leg.id} data-done={done.includes(leg.id) || undefined}>
              <LegBlock
                leg={leg}
                n={index + 1}
                done={done.includes(leg.id)}
                current={currentIds.has(leg.id)}
                expanded={currentIds.has(leg.id) !== flipped.has(holdKey(leg))}
                onToggle={() => onToggle(holdKey(leg))}
                onTick={(checked) => onTick(leg, index + 1, checked)}
                rows={legRows.get(leg.id)}
                capacityM3={capacityM3}
                legs={legs}
              />
              <Stop
                name={leg.to.name}
                last={index === legs.length - 1}
                done={done.includes(leg.id)}
                current={currentIds.has(leg.id)}
                actionRow={stopActionRow(legStopAction(legs, leg), {
                  n: index + 1,
                  expanded: currentIds.has(leg.id) !== flipped.has(stopKey(leg)),
                  onToggle: () => onToggle(stopKey(leg)),
                })}
              />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** Which fold a toggle belongs to: a Leg's hold, or what happens at the stop the Leg ends at. */
const holdKey = (leg: HaulLeg) => `hold:${leg.id}`;
const stopKey = (leg: HaulLeg) => `stop:${leg.id}`;

/**
 * A place on the rail: the system in full, the station and moon on a dim
 * second line, and what the pilot does there (load, drop or take a ship) when
 * the Leg that ends here has something to do. The items to pick up or drop
 * unfold under that line, so the list sits where the pilot is standing.
 */
function Stop({
  name,
  start,
  last,
  done,
  current,
  actionRow,
}: {
  name: string;
  start?: boolean;
  last?: boolean;
  /** Reached: the pilot has ticked the Leg that ends here (the start always is). */
  done?: boolean;
  /** The stop the pilot is flying to next. */
  current?: boolean;
  /** What happens here; absent at the start and where a flight just lands. */
  actionRow?: StopActionRowProps | null;
}) {
  const { system, detail } = splitPlaceName(name);
  return (
    <div className="relative py-1.5 pl-5">
      <i
        aria-hidden="true"
        className={cx(
          'absolute top-2.5 -left-2 block size-3.5 rounded-full border-2 bg-panel',
          start ? 'border-line-bright' : 'border-accent',
          last && 'bg-accent',
          done && 'opacity-40',
          current && 'ring-2 ring-accent/60'
        )}
      />
      <div className="text-sm font-semibold">{system}</div>
      {detail && <div className="text-xs text-text-dim [overflow-wrap:anywhere]">{detail}</div>}
      {actionRow && <StopActionRow {...actionRow} done={done} />}
    </div>
  );
}

interface StopActionRowProps {
  action: StopAction;
  /** The ending Leg's number, for the toggle's name. */
  n: number;
  expanded: boolean;
  onToggle: () => void;
}

/** The row for a Stop, or `null` where the Leg ending there has nothing to do. */
function stopActionRow(
  action: StopAction | null,
  rest: Omit<StopActionRowProps, 'action'>
): StopActionRowProps | null {
  return action && { action, ...rest };
}

/** "Load 25 m³", "Drop 118.99 m³" or "Take Omen", opening to the items where there are some. */
function StopActionRow({
  action,
  n,
  done,
  expanded,
  onToggle,
}: StopActionRowProps & { done?: boolean }) {
  const { t } = useTranslation();
  const label =
    action.kind === 'take'
      ? t('assets.movePlan.haul.stopTake', { ships: action.ships.join(', ') })
      : t(
          action.kind === 'load'
            ? 'assets.movePlan.haul.stopLoad'
            : 'assets.movePlan.haul.stopDrop',
          {
            volume: formatCubicMetres(action.m3),
          }
        );
  const tone = cx(
    'text-sm font-medium',
    action.kind === 'drop' ? 'text-warning' : 'text-accent',
    done && 'opacity-60'
  );
  const items = action.kind === 'take' ? null : action.stacks;
  if (!items) {
    return (
      <div className={cx('mt-1', tone)}>
        <span aria-hidden="true">↳ </span>
        {label}
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={t(
          expanded ? 'assets.movePlan.haul.stopItemsHide' : 'assets.movePlan.haul.stopItemsShow',
          { action: label, n }
        )}
        onClick={onToggle}
        className={cx(
          'mt-1 flex min-h-9 items-center gap-2 text-left',
          tone,
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        <Caret expanded={expanded} />
        {label}
      </button>
      {expanded && (
        <div className={cx('ml-1', done && 'opacity-60')}>
          <ItemList items={items} />
        </div>
      )}
    </>
  );
}

function LegBlock({
  leg,
  n,
  done,
  current,
  expanded,
  onToggle,
  onTick,
  rows,
  capacityM3,
  legs,
}: {
  leg: HaulLeg;
  n: number;
  done: boolean;
  current: boolean;
  expanded: boolean;
  onToggle: () => void;
  onTick: (checked: boolean) => void;
  rows: LegRows | undefined;
  capacityM3: number;
  /** The Character's legs, for what is already in the hold. */
  legs: readonly HaulLeg[];
}) {
  const { t } = useTranslation();
  const href = legRouteHref(leg);
  const condition = rows?.status === 'ready' ? legCondition(rows.rows) : null;
  const destination = splitPlaceName(leg.to.name).system;
  const hold = legHold(legs, leg);
  // The heading says what this Leg is: the trip out to a ship or load while the hold is empty, a
  // flight of that ship, or a haul of what is already aboard (a later pickup in a trip, or the
  // delivery). What happens at its end is the next Stop's to say.
  const ships = leg.ships?.join(', ');
  const heading = ships
    ? t(leg.kind === 'pickup' ? 'assets.movePlan.haul.travel' : 'assets.movePlan.haul.fly', {
        ships,
        place: destination,
      })
    : t(hold.aboard.length === 0 ? 'assets.movePlan.haul.travel' : 'assets.movePlan.haul.haul', {
        place: destination,
      });
  const carried = hold.aboard.reduce((sum, l) => sum + l.m3, 0);
  const aboardItems = heldItems(hold.aboard);
  return (
    <div
      className={cx(
        'my-1 ml-5 flex flex-col gap-2.5 rounded-xs border bg-panel-2 p-3',
        current ? 'border-line-bright' : 'border-line',
        done && 'opacity-60'
      )}
    >
      <div className="text-sm font-semibold">{heading}</div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <label className={touchCheckboxLabelClassName}>
            <Checkbox
              checked={done}
              onChange={(e) => onTick(e.target.checked)}
              aria-label={t('assets.movePlan.haul.markDoneAria', { n })}
            />
          </label>
          <span className="text-xl leading-none font-semibold tabular-nums">
            {leg.jumps === null ? (
              <span className="text-sm font-normal text-text-dim">
                {t('assets.movePlan.haul.noGateRoute')}
              </span>
            ) : (
              <>
                {leg.jumps}
                <span className="ml-1 text-xs font-normal text-text-dim">
                  {t('assets.movePlan.haul.jumpUnit', { count: leg.jumps })}
                </span>
              </>
            )}
          </span>
          {condition && (
            <Pill tone={TONE[condition.kind]}>
              {t(`assets.movePlan.haul.condition_${condition.kind}`, {
                count: 'count' in condition ? condition.count : 0,
              })}
            </Pill>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <HaulWaypointButton
            characterId={leg.characterId}
            ids={legWaypointIds(leg)}
            label={t('assets.movePlan.haul.waypoint')}
            doneLabel={t('assets.movePlan.haul.waypointDone')}
            ariaLabel={t('assets.movePlan.haul.waypointAria', { n })}
          />
          {href && (
            <Link
              className={buttonClassName({ size: 'sm' })}
              aria-label={t('assets.movePlan.haul.showInRouteSafetyAria', { n })}
              to={href}
            >
              {t('assets.movePlan.haul.showInRouteSafety')}
            </Link>
          )}
        </div>
      </div>
      {rows?.status === 'ready' && <HaulStrip rows={rows.rows} />}
      {/* A flight has no hold to show: the pilot flies the ship itself. */}
      {!leg.ships &&
        (carried > 0 ? (
          <>
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={t(
                expanded ? 'assets.movePlan.haul.cargoHide' : 'assets.movePlan.haul.cargoShow',
                { n }
              )}
              onClick={onToggle}
              className={cx(
                'flex min-h-9 items-center gap-2 border-t border-dashed border-line pt-2 text-left text-sm text-text-dim',
                rowInteractiveClassName,
                focusRingInsetClassName
              )}
            >
              <Caret expanded={expanded} />
              {t('assets.movePlan.haul.carryLoaded', { volume: formatCubicMetres(carried) })}
            </button>
            {expanded && (
              <div className="flex flex-col gap-1 text-sm tabular-nums">
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {hold.aboard.map((load, i) => (
                    <li key={i}>
                      {t('assets.movePlan.haul.cargoLine', {
                        place: splitPlaceName(load.place).system,
                        volume: formatCubicMetres(load.m3),
                      })}
                    </li>
                  ))}
                </ul>
                {aboardItems && <ItemList items={aboardItems} />}
                {capacityM3 > 0 && (
                  <p className="m-0 text-text-dim">
                    {t('assets.movePlan.haul.holdFill', {
                      percent: Math.round((carried / capacityM3) * 100),
                    })}
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          // Nothing aboard, so nothing to open: what loads at the end is the next Stop's.
          <div className="flex min-h-9 items-center border-t border-dashed border-line pt-2 text-sm text-text-dim">
            {t('assets.movePlan.haul.carryEmpty')}
          </div>
        ))}
    </div>
  );
}

/** Items shown before the rest fold into a count: a freighter's hold can hold hundreds of types. */
const ITEMS_SHOWN = 6;

/** What a load is made of, biggest by volume first. */
function ItemList({ items }: { items: readonly HaulStack[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const sorted = [...items].sort((a, b) => b.quantity * b.unitM3 - a.quantity * a.unitM3);
  const more = sorted.length - ITEMS_SHOWN;
  return (
    <ul className="m-0 ml-4 flex list-none flex-col gap-0.5 border-l border-line p-0 pl-3 text-text-dim">
      {(all ? sorted : sorted.slice(0, ITEMS_SHOWN)).map((s) => (
        <li key={s.typeId}>
          {t('assets.movePlan.haul.itemLine', { quantity: formatCount(s.quantity), name: s.name })}
        </li>
      ))}
      {more > 0 && (
        <li>
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll(!all)}
            className={cx(inlineLinkClassName, focusRingInsetClassName)}
          >
            {all
              ? t('assets.movePlan.haul.itemsFewer')
              : t('assets.movePlan.haul.itemsMore', { count: more })}
          </button>
        </li>
      )}
    </ul>
  );
}
