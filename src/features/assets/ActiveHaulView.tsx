import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, Caret } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { inlineLinkClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import type { HaulLeg, HaulSection } from '@/engine/route/haulPlan';
import { cx } from '@/lib/cx';
import { formatCubicMetres } from '@/lib/volume';
import { legRouteHref, type ActiveHaul } from './activeHaul';

interface ActiveHaulViewProps {
  haul: ActiveHaul;
  onBack: () => void;
  onClear: () => Promise<void>;
}

/** The Leg a pilot flies next. No progress is tracked yet (#4968), so it is the first one. */
const NEXT_LEG_ID = 0;

/**
 * The active haul: a slim ordered checklist of Legs, one section per Character.
 * A node-and-line strip shows the route's shape, a summary line gives its size,
 * and the next Leg is open while later ones fold. Route Safety is the analyser;
 * each Leg only links there, so nothing here judges a route.
 */
export function ActiveHaulView({ haul, onBack, onClear }: ActiveHaulViewProps) {
  const { t } = useTranslation();
  const { plan, destination } = haul;
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set([NEXT_LEG_ID]));
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

function Section({
  section,
  open,
  onToggle,
  many,
}: {
  section: HaulSection;
  open: ReadonlySet<number>;
  onToggle: (id: number) => void;
  many: boolean;
}) {
  const { t } = useTranslation();
  const { legs } = section;
  // The route's places in order: where it starts, then every Leg's end.
  const nodes = [
    ...(legs[0]?.from ? [{ key: 'start', delivery: false }] : []),
    ...legs.map((l) => ({ key: String(l.id), delivery: l.kind === 'delivery' })),
  ];
  return (
    <section
      aria-label={many ? section.name : t('assets.movePlan.haul.legsLabel')}
      className="flex flex-col gap-2"
    >
      {many && (
        <h4 className="m-0 flex flex-wrap items-baseline gap-x-3 text-sm font-semibold">
          {section.name}
          <span className="text-xs font-normal text-text-dim">
            {t('assets.movePlan.haul.tripCount', { count: section.trips })}
          </span>
        </h4>
      )}
      <div className="flex items-center overflow-x-auto py-1" aria-hidden="true">
        {nodes.map((node, index) => (
          <span key={node.key} className="flex items-center">
            {index > 0 && <i className="block h-0.5 w-5 shrink-0 bg-line-bright/55" />}
            <i
              className={cx(
                'block size-3 shrink-0 rounded-full border-2',
                node.delivery ? 'border-accent bg-accent' : 'border-line-bright bg-panel',
                index === (legs[0]?.from ? 1 : 0) && 'ring-2 ring-accent/60'
              )}
            />
          </span>
        ))}
      </div>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {legs.map((leg, index) => (
          <LegRow
            key={leg.id}
            leg={leg}
            n={index + 1}
            expanded={open.has(leg.id)}
            onToggle={() => onToggle(leg.id)}
          />
        ))}
      </ol>
    </section>
  );
}

function LegRow({
  leg,
  n,
  expanded,
  onToggle,
}: {
  leg: HaulLeg;
  n: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const href = legRouteHref(leg);
  const from = leg.from?.name ?? t('assets.movePlan.haul.startUnknown');
  const volume = formatCubicMetres(leg.m3);
  return (
    <li data-leg-id={leg.id} className="rounded-xs border border-line bg-panel-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cx(
          'flex min-h-11 w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm md:min-h-9',
          rowInteractiveClassName
        )}
      >
        <Caret expanded={expanded} />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <span className="tabular-nums">{n}. </span>
          {t('assets.movePlan.haul.legTitle', { from, to: leg.to.name })}
        </span>
        <span className="shrink-0 text-xs text-text-dim tabular-nums">
          {leg.jumps === null
            ? t('assets.movePlan.haul.noGateRoute')
            : t('assets.movePlan.haul.jumpCount', { count: leg.jumps })}
        </span>
      </button>
      {expanded && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line px-2.5 py-2 text-sm">
          <span className="tabular-nums">
            {t(leg.kind === 'pickup' ? 'assets.movePlan.haul.load' : 'assets.movePlan.haul.drop', {
              volume,
              place: leg.to.name,
            })}
          </span>
          {href && (
            <Link
              className={`${inlineLinkClassName} whitespace-nowrap`}
              aria-label={t('assets.movePlan.haul.showInRouteSafetyAria', { n })}
              to={href}
            >
              {t('assets.movePlan.haul.showInRouteSafety')}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
