import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Caret } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  inlineLinkClassName,
  focusRingInsetClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import type { HaulLeg, HaulSection } from '@/engine/route/haulPlan';
import {
  legCarry,
  legCondition,
  legWaypointIds,
  sectionWaypointIds,
  splitPlaceName,
  type LegCondition,
} from '@/engine/route/haulLeg';
import { cx } from '@/lib/cx';
import { formatCubicMetres } from '@/lib/volume';
import { legRouteHref, sectionRouteHref, type ActiveHaul } from './activeHaul';
import { HaulStrip } from './HaulStrip';
import { HaulWaypointButton } from './HaulWaypointButton';
import { useHaulLegRows, type LegRows } from './useHaulLegRows';

interface ActiveHaulViewProps {
  haul: ActiveHaul;
  onBack: () => void;
  onClear: () => Promise<void>;
}

/**
 * The active haul as a timeline, one section per Character: stops down a rail
 * and a block per Leg between them, with its distance, the security it flies
 * through (a strip with per-system kills), waypoint and Route Safety actions,
 * and its cargo folded away. Route Safety is the analyser; a Leg states the
 * condition it flies through and links there, so nothing here judges a route.
 */
export function ActiveHaulView({ haul, onBack, onClear }: ActiveHaulViewProps) {
  const { t } = useTranslation();
  const { plan, destination } = haul;
  const legRows = useHaulLegRows(plan.sections.flatMap((s) => s.legs));
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const [clearing, setClearing] = useState(false);
  const toggle = (id: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const jumpsLabel = (count: number) => t('assets.movePlan.haul.jumpCount', { count });

  return (
    <div className="flex flex-1 flex-col gap-3">
      <h3 tabIndex={-1} className="m-0 text-base font-bold focus:outline-none">
        {t('assets.movePlan.haul.title')}
      </h3>
      <p className="m-0 text-sm text-text-dim tabular-nums">
        {t('assets.movePlan.haul.summary', {
          legs: t('assets.movePlan.haul.legCount', { count: plan.totals.legs }),
          jumps: jumpsLabel(plan.totals.jumps),
          volume: formatCubicMetres(plan.totals.m3),
          destination: destination.name,
        })}
      </p>
      {plan.sections.map((section) => (
        <Section
          key={section.characterId}
          section={section}
          open={open}
          onToggle={toggle}
          legRows={legRows}
          capacityM3={haul.capacityM3}
          many={plan.sections.length > 1}
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
      <div className="sticky -bottom-3 mt-auto -mx-3 -mb-3 flex justify-end gap-2 border-t border-line bg-panel px-3 pt-2 pb-[calc(0.5rem_+_env(safe-area-inset-bottom))]">
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
  open,
  onToggle,
  many,
  legRows,
  capacityM3,
}: {
  section: HaulSection;
  open: ReadonlySet<number>;
  onToggle: (id: number) => void;
  many: boolean;
  legRows: ReadonlyMap<number, LegRows>;
  capacityM3: number;
}) {
  const { t } = useTranslation();
  const { legs } = section;
  const first = legs[0];
  const routeHref = sectionRouteHref(legs);
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
            ids={sectionWaypointIds(legs)}
            label={t('assets.movePlan.haul.waypointAll')}
            doneLabel={t('assets.movePlan.haul.waypointAllDone')}
            variant={many ? 'ghost' : 'primary'}
          />
          {routeHref && (
            <Link className={`${inlineLinkClassName} text-sm whitespace-nowrap`} to={routeHref}>
              {t('assets.movePlan.haul.routeSafetyAll')}
            </Link>
          )}
        </div>
      </div>
      <div className="ml-2 border-l-2 border-line-bright/55">
        {first && <Stop name={first.from?.name ?? t('assets.movePlan.haul.startUnknown')} start />}
        <ol className="m-0 flex list-none flex-col p-0">
          {legs.map((leg, index) => (
            <li key={leg.id} data-leg-id={leg.id}>
              <LegBlock
                leg={leg}
                n={index + 1}
                expanded={open.has(leg.id)}
                onToggle={() => onToggle(leg.id)}
                rows={legRows.get(leg.id)}
                capacityM3={capacityM3}
              />
              <Stop name={leg.to.name} leg={leg} last={index === legs.length - 1} />
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** A place on the rail: the system in full, the station and moon on a dim second line. */
function Stop({
  name,
  leg,
  start,
  last,
}: {
  name: string;
  leg?: HaulLeg;
  start?: boolean;
  last?: boolean;
}) {
  const { t } = useTranslation();
  const { system, detail } = splitPlaceName(name);
  return (
    <div className="relative py-1.5 pl-5">
      <i
        aria-hidden="true"
        className={cx(
          'absolute top-2.5 -left-2 block size-3.5 rounded-full border-2 bg-panel',
          start ? 'border-line-bright' : 'border-accent',
          last && 'bg-accent'
        )}
      />
      <div className="text-sm font-semibold">{system}</div>
      {detail && <div className="text-xs text-text-dim [overflow-wrap:anywhere]">{detail}</div>}
      {leg && (
        <span
          className={cx(
            'mt-1 inline-block rounded-xs border px-2 py-0.5 text-xs tabular-nums',
            leg.kind === 'pickup' ? 'border-accent text-accent' : 'border-warning text-warning'
          )}
        >
          {t(leg.kind === 'pickup' ? 'assets.movePlan.haul.load' : 'assets.movePlan.haul.drop', {
            volume: formatCubicMetres(leg.m3),
            place: system,
          })}
        </span>
      )}
    </div>
  );
}

function LegBlock({
  leg,
  n,
  expanded,
  onToggle,
  rows,
  capacityM3,
}: {
  leg: HaulLeg;
  n: number;
  expanded: boolean;
  onToggle: () => void;
  rows: LegRows | undefined;
  capacityM3: number;
}) {
  const { t } = useTranslation();
  const href = legRouteHref(leg);
  const condition = rows?.status === 'ready' ? legCondition(rows.rows) : null;
  const volume = formatCubicMetres(leg.m3);
  const carry = legCarry(leg);
  const place = splitPlaceName(leg.to.name).system;
  return (
    <div className="my-1 ml-5 flex flex-col gap-2.5 rounded-xs border border-line bg-panel-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
              className={`${inlineLinkClassName} text-sm whitespace-nowrap`}
              aria-label={t('assets.movePlan.haul.showInRouteSafetyAria', { n })}
              to={href}
            >
              {t('assets.movePlan.haul.showInRouteSafety')}
            </Link>
          )}
        </div>
      </div>
      {rows?.status === 'ready' && <HaulStrip rows={rows.rows} />}
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
        {carry === 'loaded'
          ? t('assets.movePlan.haul.carryLoaded', { volume })
          : t('assets.movePlan.haul.carryEmpty')}
      </button>
      {expanded && (
        <p className="m-0 text-sm tabular-nums">
          {carry === 'loaded'
            ? t('assets.movePlan.haul.carryDrops', { volume, place })
            : t('assets.movePlan.haul.carryLoadsOnArrival', { volume, place })}
          {capacityM3 > 0 && (
            <span className="text-text-dim">
              {' · '}
              {t('assets.movePlan.haul.holdFill', {
                percent: Math.round((leg.m3 / capacityM3) * 100),
              })}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
