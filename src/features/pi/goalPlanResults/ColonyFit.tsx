/** Whether it fits: each colony's role, load against its budget, and slots. */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { InfoTooltip, Panel } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { PiData } from '@/sde/types';
import type { ColonyAssignment, ExtractionSlot } from '@/engine/pi/goalTypes';
import { EstimateBadge, LoadMeter } from '../DirectiveRow';
import type { PlannerColonyRow } from '../goalPlannerModel';
import { formatUnits } from '../goalPlannerFormat';
import { slotEstimate, type ColonyStep, type SlotEstimate } from '../goalPlanView';
import { ColonyLink } from './ColonyLink';
import { ProductSentence } from './ProductSentence';
import { limitsText, type PlanNames } from './format';

function estimateText(estimate: SlotEstimate, ecusToday: number | undefined, t: TFunction): string {
  switch (estimate) {
    case 'ecus-changed':
      return t('piPlan.rateEcusChanged', { count: ecusToday ?? 0 });
    case 'own-mean':
      return t('piPlan.rateOwnMean');
    case 'assumed':
      return t('piPlan.rateAssumed');
  }
}

function roleText(role: ColonyAssignment['role'], t: TFunction): string {
  switch (role) {
    case 'extract':
      return t('piPlan.roleExtract');
    case 'factory':
      return t('piPlan.roleFactory');
    case 'baseline':
      return t('piPlan.roleBaseline');
    case 'idle':
      return t('piPlan.roleIdle');
  }
}

function SlotLine({
  slot,
  ecusToday,
  pi,
}: {
  slot: ExtractionSlot;
  /** ECUs the colony runs on this P0 today, when known. */
  ecusToday: number | undefined;
  pi: PiData;
}) {
  const { t } = useTranslation();
  const estimate = slotEstimate(slot, ecusToday);
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text">
      <span>
        <ProductSentence
          text={t('piPlan.slotLine', {
            p0: '{p0}',
            p1: '{p1}',
            count: slot.ecus,
            rate: formatUnits(Math.round(slot.p1PerHour)),
          })}
          products={{ p0: slot.p0TypeId, p1: slot.p1TypeId }}
          pi={pi}
        />
      </span>
      {estimate !== null && (
        <span className="inline-flex items-center gap-1">
          <EstimateBadge />
          <InfoTooltip
            label={t('common.aboutLabel', { label: t('piShared.estimateBadge') })}
            content={estimateText(estimate, ecusToday, t)}
          />
        </span>
      )}
    </li>
  );
}

export function ColonyFit({
  assignments,
  rows,
  steps,
  names,
}: {
  assignments: readonly ColonyAssignment[];
  rows: readonly PlannerColonyRow[];
  /** The change list's steps, so a colony reads "As is" in both places. */
  steps: readonly ColonyStep[];
  names: PlanNames;
}) {
  const { t } = useTranslation();
  const rowById = new Map(rows.map((row) => [row.planetId, row]));
  const stepById = new Map(steps.map((step) => [step.planetId, step]));
  const shown = assignments.filter((assignment) => assignment.role !== 'idle');
  if (shown.length === 0) return null;
  return (
    <Panel title={t('piPlan.fitTitle')}>
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((assignment) => {
          const row = rowById.get(assignment.planetId);
          const heads = row?.colony?.headsPerExtractor ?? 0;
          return (
            <li
              key={assignment.planetId}
              className="space-y-2 rounded-xs border border-line bg-panel-2/40 p-2.5"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm">
                  <ColonyLink planetId={assignment.planetId} names={names} />
                </span>
                <span className="shrink-0 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {stepById.get(assignment.planetId)?.kind === 'as-is'
                    ? t('piPlan.roleBaseline')
                    : roleText(assignment.role, t)}
                </span>
              </div>
              {assignment.runningToday &&
              (assignment.used.cpu > assignment.budget.cpu ||
                assignment.used.powergrid > assignment.budget.powergrid) ? (
                <p className="flex items-center gap-1.5 text-xs text-text">
                  {t('piPlan.fitAsBuilt')}
                  <InfoTooltip
                    label={t('common.aboutLabel', {
                      label: t('piPlan.fitAsBuiltNamed', {
                        name: names.planet(assignment.planetId),
                      }),
                    })}
                    content={t('piPlan.fitAsBuiltTooltip')}
                  />
                </p>
              ) : (
                <>
                  <LoadMeter
                    label={t('piPlan.cpu')}
                    used={assignment.used.cpu}
                    budget={assignment.budget.cpu}
                  />
                  <LoadMeter
                    label={t('piPlan.powergrid')}
                    used={assignment.used.powergrid}
                    budget={assignment.budget.powergrid}
                  />
                </>
              )}
              {assignment.limitedBy.length > 0 && (
                <p className="flex items-center gap-1 text-[0.6875rem] text-warning">
                  <Icon.Warn aria-hidden="true" size={Icon.ICON_SIZE.sm} />
                  {t('piPlan.fitOver', { limits: limitsText(assignment.limitedBy, t) })}
                </p>
              )}
              {assignment.slots.length > 0 && (
                <ul className="space-y-1">
                  {assignment.slots.map((slot) => (
                    <SlotLine
                      key={slot.p0TypeId}
                      slot={slot}
                      ecusToday={row?.colony?.current.ecusByP0?.get(slot.p0TypeId)}
                      pi={names.pi}
                    />
                  ))}
                </ul>
              )}
              {assignment.role === 'factory' && (
                <p className="text-xs text-text">
                  {(['basic', 'advanced', 'highTech'] as const)
                    .filter((kind) => (assignment.factories[kind] ?? 0) > 0)
                    .map((kind) =>
                      t('piPlan.pinCount', {
                        count: assignment.factories[kind],
                        pin: t(`piShared.pinKind.${kind}`),
                      })
                    )
                    .join(', ')}
                </p>
              )}
              {row && (row.headsAssumed || row.linkCostBorrowed) && (
                <p className="text-[0.6875rem] text-text-dim">
                  {[
                    row.headsAssumed ? t('piPlan.fitBorrowedHeads', { heads }) : null,
                    row.linkCostBorrowed ? t('piPlan.fitBorrowedLink') : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
