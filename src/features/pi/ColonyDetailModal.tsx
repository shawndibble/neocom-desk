/**
 * One colony's detail — everything the card deliberately does not say.
 *
 * The card answers "what should I do here" in two rows. This answers "why,
 * and against what": the measured extraction and production, both budget axes
 * with their real figures, what the links draw, every instruction with its
 * reasoning, the build-up-to recommendation, and the basis every number rests
 * on.
 *
 * Nothing here is new information — it is the prose the cards used to carry,
 * moved somewhere a pilot goes when they want it rather than somewhere they
 * have to read past to find the instruction.
 *
 * The dialog itself is owned by `AdvisorPanel`: one `<Modal>` for the whole
 * tab with the selected planet in state, never one per card. Eight mounted
 * `<dialog>` elements, each with its own focus-restore effect, is both
 * wasteful and a source of focus bugs.
 */
import { useTranslation } from 'react-i18next';
import type { PiData } from '@/sde/types';
import type { NetworkConversion, NetworkOpportunity } from '@/engine/pi/network';
import type { PlanetAdvice } from './advisorModel';
import type { MaxColonyBudget } from './colonyBudget';
import { colonyBudget } from './colonyBudget';
import type { ColonyPlan } from './colonyPlan';
import { roomSummary } from './colonyPlan';
import type { ColonyStopTierAdvice } from './stopTierModel';
import { CapacityFootnote, ColonyReasoning, StopTierNote, StopTierRow } from './ColonyActions';
import { SectionLabel } from './DirectiveRow';

/** One axis of the CPU/Powergrid meter, with the figures the card drops. */
function BudgetBar({
  label,
  used,
  budget,
  unit,
}: {
  label: string;
  used: number;
  budget: number;
  unit: string;
}) {
  const { t } = useTranslation();
  const percent = budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
  const tight = percent >= 90;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
        <SectionLabel>{label}</SectionLabel>
        <span className="text-text-dim tabular-nums">
          {t('piAdvisor.budgetBarValue', {
            used: Math.round(used).toLocaleString(),
            budget: Math.round(budget).toLocaleString(),
            unit,
          })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t('piAdvisor.budgetBarLabel', { axis: label })}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 overflow-hidden rounded-full bg-panel-2"
      >
        <div
          className={`h-full ${tight ? 'bg-warning' : 'bg-accent'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** A block of the modal, with its micro-heading. */
function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-4 py-3.5 first:border-t-0">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

export interface ColonyDetailProps {
  advice: Extract<PlanetAdvice, { kind: 'built' }>;
  plan: ColonyPlan;
  pi: PiData;
  schematicNames: ReadonlyMap<number, string>;
  typeNames: ReadonlyMap<number, string>;
  stopTier: ColonyStopTierAdvice;
  /** The pilot's Command Center Upgrades ceiling, for spotting a colony behind it. */
  ceiling: MaxColonyBudget;
  opportunities: readonly NetworkOpportunity[];
  conversions: readonly NetworkConversion[];
  planetNames: ReadonlyMap<number, string>;
  owners: ReadonlyMap<number, string>;
}

export function ColonyDetail({
  advice,
  plan,
  pi,
  schematicNames,
  typeNames,
  stopTier,
  ceiling,
  opportunities,
  conversions,
  planetNames,
  owners,
}: ColonyDetailProps) {
  const { t } = useTranslation();
  const { colony } = advice;
  // The next Command Center level, not the pilot's ceiling: levels are bought
  // one at a time, for ISK, per colony.
  const nextLevel = colonyBudget(colony.upgradeLevel + 1, pi);

  return (
    <div className="divide-y divide-line">
      <Block label={t('piAdvisor.nowLabel')}>
        <div className="grid gap-x-7 gap-y-4 sm:grid-cols-2">
          <dl className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-1 text-xs">
            {colony.extractedPerHour.map((line, index) => (
              <div key={line.typeId} className="contents">
                <dt>
                  {index === 0 ? <SectionLabel>{t('piAdvisor.extractsLabel')}</SectionLabel> : null}
                </dt>
                <dd className="m-0">{typeNames.get(line.typeId) ?? t('pi.unknownProduct')}</dd>
                <dd className="m-0 text-right text-text-dim tabular-nums">
                  {t('piAdvisor.unitsPerHour', {
                    units: Math.round(line.unitsPerHour).toLocaleString(),
                  })}
                </dd>
              </div>
            ))}
            {colony.production.map((group, index) => (
              <div key={String(group.schematicId)} className="contents">
                <dt>
                  {index === 0 ? <SectionLabel>{t('piAdvisor.makesLabel')}</SectionLabel> : null}
                </dt>
                <dd className="m-0">
                  {group.schematicId !== undefined
                    ? (schematicNames.get(group.schematicId) ?? t('pi.unknownSchematic'))
                    : t('pi.unknownSchematic')}
                </dd>
                <dd className="m-0 text-right text-text-dim tabular-nums">
                  {t('piAdvisor.facilityCount', { count: group.count })}
                </dd>
              </div>
            ))}
            {colony.pinLoad.linkLoad !== null && colony.linkCount > 0 && (
              <div className="contents">
                <dt>
                  <SectionLabel>{t('piAdvisor.linksLabel')}</SectionLabel>
                </dt>
                <dd className="m-0">{t('piAdvisor.linkCount', { count: colony.linkCount })}</dd>
                <dd className="m-0 text-right text-text-dim tabular-nums">
                  {t('piAdvisor.linkDrawValue', {
                    cpu: Math.round(colony.pinLoad.linkLoad.cpu).toLocaleString(),
                    powergrid: Math.round(colony.pinLoad.linkLoad.powergrid).toLocaleString(),
                  })}
                </dd>
              </div>
            )}
          </dl>

          <div className="space-y-2.5">
            <BudgetBar
              label={t('piAdvisor.cpu')}
              used={colony.pinLoad.load.cpu}
              budget={plan.budget.cpu}
              unit={t('piAdvisor.cpuUnit')}
            />
            <BudgetBar
              label={t('piAdvisor.powergrid')}
              used={colony.pinLoad.load.powergrid}
              budget={plan.budget.powergrid}
              unit={t('piAdvisor.powergridUnit')}
            />
            <CapacityFootnote
              spare={plan.spare}
              newLinkCost={plan.newLinkCost}
              room={plan.full ? '' : roomSummary(plan.headroom, t)}
              closest={plan.closest}
            />
          </div>
        </div>

        {!colony.detailLoaded && (
          <p className="mt-3 text-xs text-warning">{t('piAdvisor.detailUnavailable')}</p>
        )}
        {colony.detailLoaded && colony.extractedPerHour.length === 0 && (
          <p className="mt-3 text-xs text-text-dim">{t('piAdvisor.noMeasuredExtraction')}</p>
        )}
        {colony.pinLoad.unknownTypeIds.length > 0 && (
          <p className="mt-2 text-[0.6875rem] text-text-dim">
            {t('piAdvisor.unknownPins', { count: colony.pinLoad.unknownTypeIds.length })}
          </p>
        )}
        {/*
          Powergrid is what binds nearly every colony, and on a pilot whose
          skill has outrun their Command Centers there is a level of it sitting
          behind an ISK purchase. The *next* level, not the jump to the
          ceiling: each level is bought separately, so quoting the whole
          distance would describe three purchases as one. Only ever said off a
          trained ceiling.
        */}
        {!ceiling.assumed && colony.upgradeLevel < ceiling.level && (
          <p className="mt-2 text-[0.6875rem] text-accent">
            {t('piAdvisor.upgradeAvailable', {
              level: colony.upgradeLevel,
              max: ceiling.level,
              cpu: Math.round(nextLevel.budget.cpu - plan.budget.cpu).toLocaleString(),
              powergrid: Math.round(
                nextLevel.budget.powergrid - plan.budget.powergrid
              ).toLocaleString(),
            })}
          </p>
        )}
      </Block>

      <Block label={t('piAdvisor.actionsLabel')}>
        {/*
          A colony with links this app cannot fully measure gets no advice at
          all — the same rule the unbuilt cards follow: name what is true,
          print no number that isn't.
        */}
        {colony.linkCount > 0 && colony.pinLoad.linkLoad === null ? (
          <p className="text-xs text-text-dim">
            {t('piAdvisor.roomUnknownRadius', { count: colony.linkCount })}
          </p>
        ) : (
          <ColonyReasoning
            idle={plan.idle}
            pi={pi}
            opportunities={opportunities}
            conversions={conversions}
            planetNames={planetNames}
            owners={owners}
          />
        )}
      </Block>

      <Block label={t('piAdvisor.stopTierLabel')}>
        <div className="space-y-2">
          <StopTierRow result={stopTier} extractedPerHour={colony.extractedPerHour} />
          <StopTierNote result={stopTier} extractedPerHour={colony.extractedPerHour} />
        </div>
      </Block>

      <Block label={t('piAdvisor.howLabel')}>
        <p className="text-xs text-text-dim">{t('piAdvisor.measuredOnlyHint')}</p>
      </Block>
    </div>
  );
}
