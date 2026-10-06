/** What to set up: one directive per colony the plan changes. */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Panel } from '@/components/ui';
import { clampIskZero } from '@/lib/isk';
import { DirectiveRow, type DirectiveVerb } from '../DirectiveRow';
import type { ColonyStep, StepKind } from '../goalPlanView';
import { ColonyLink } from './ColonyLink';
import { endName, signedCompact, type PlanNames } from './format';
import { ProductSentence, type ProductSlots } from './ProductSentence';

const STEP_VERB: Record<StepKind, DirectiveVerb> = {
  'as-is': 'asIs',
  start: 'start',
  add: 'add',
  stop: 'stop',
  retarget: 'swap',
  host: 'build',
  idle: 'asIs',
};

function stepHeadline(step: ColonyStep, t: TFunction): string {
  switch (step.kind) {
    case 'as-is':
      return step.notNeeded ? t('piPlan.stepNotNeeded') : t('piPlan.stepAsIs');
    case 'start':
      return t('piPlan.stepStart');
    case 'add':
      return t('piPlan.stepAdd');
    case 'stop':
      return t('piPlan.stepStopHeadline');
    case 'retarget':
      return t('piPlan.stepRetargetHeadline');
    case 'host':
      return t('piPlan.stepHost');
    case 'idle':
      return t('piPlan.stepIdle');
  }
}

function StepDetail({
  step,
  names,
  switchGainPerDay,
}: {
  step: ColonyStep;
  names: PlanNames;
  /** Not needed: what switching to its best P1 would add a day, when known. */
  switchGainPerDay: number | null;
}) {
  const { t } = useTranslation();
  const { pi } = names;
  const lines: { text: string; products: ProductSlots; tone?: 'tip' }[] = [];
  for (const stop of step.stop) {
    lines.push({
      text: t('piPlan.stepRemove', { count: stop.ecus, p0: '{p0}' }),
      products: { p0: stop.p0TypeId },
    });
  }
  if (step.kind !== 'as-is' && step.kind !== 'idle') {
    for (const slot of step.extract) {
      lines.push({
        text: t('piPlan.stepExtract', {
          count: slot.ecus,
          p0: '{p0}',
          basics: slot.basicFactories,
          p1: '{p1}',
        }),
        products: { p0: slot.p0TypeId, p1: slot.p1TypeId },
      });
    }
    for (const factory of step.factories) {
      lines.push({
        text: t('piPlan.stepFactory', { count: factory.count, product: '{product}' }),
        products: { product: factory.typeId },
      });
    }
  }
  for (const ship of step.ships) {
    // A colony left as it is already sells at the hub: only a new leg is a step.
    if (step.kind === 'as-is' && !ship.isNew) continue;
    const text = t('piPlan.stepShip', { item: '{item}', to: endName(ship.to, names) });
    lines.push({
      text: ship.isNew ? t('piPlan.stepNew', { step: text }) : text,
      products: { item: ship.typeId },
    });
  }
  if (step.switchTo.length > 0) {
    lines.push({
      text:
        switchGainPerDay !== null && clampIskZero(switchGainPerDay, 0) > 0
          ? t('piPlan.stepTipGain', { p1s: '{p1s}', isk: signedCompact(switchGainPerDay) })
          : t('piPlan.stepTip', { p1s: '{p1s}' }),
      products: { p1s: step.switchTo },
      tone: 'tip',
    });
  }
  if (lines.length === 0) return null;
  return (
    <ul className="col-span-full space-y-0.5 pl-1 text-[0.6875rem] text-text-dim">
      {lines.map((line, i) => (
        // Positional: the lines are rebuilt whole each render, never reordered.
        <li key={i} className={line.tone === 'tip' ? 'italic' : undefined}>
          <ProductSentence text={line.text} products={line.products} pi={pi} />
        </li>
      ))}
    </ul>
  );
}

export function Changes({
  steps,
  names,
  switchGainPerDay,
}: {
  steps: readonly ColonyStep[];
  names: PlanNames;
  switchGainPerDay: (planetId: number) => number | null;
}) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;
  return (
    <Panel title={t('piPlan.changesTitle')}>
      <ul className="space-y-3">
        {steps.map((step) => (
          <li key={step.planetId}>
            <DirectiveRow
              verb={STEP_VERB[step.kind]}
              chips={
                <StepDetail
                  step={step}
                  names={names}
                  switchGainPerDay={switchGainPerDay(step.planetId)}
                />
              }
            >
              <ColonyLink planetId={step.planetId} names={names} />
              {' — '}
              {stepHeadline(step, t)}
            </DirectiveRow>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
