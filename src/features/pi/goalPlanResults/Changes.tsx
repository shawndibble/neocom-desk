/** What to set up: one directive per colony the plan changes. */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Panel } from '@/components/ui';
import { clampIskZero } from '@/lib/isk';
import { DirectiveRow, type DirectiveVerb } from '../DirectiveRow';
import { commodityName } from '../goalPlannerFormat';
import type { ColonyStep, StepKind } from '../goalPlanView';
import { ColonyLink } from './ColonyLink';
import { endName, namesList, signedCompact, type PlanNames } from './format';

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
  const lines: { key: string; text: string; tone?: 'tip' }[] = [];
  const push = (text: string, tone?: 'tip') => lines.push({ key: text, text, tone });
  for (const stop of step.stop) {
    push(t('piPlan.stepRemove', { count: stop.ecus, p0: commodityName(stop.p0TypeId, pi) }));
  }
  if (step.kind !== 'as-is' && step.kind !== 'idle') {
    for (const slot of step.extract) {
      push(
        t('piPlan.stepExtract', {
          count: slot.ecus,
          p0: commodityName(slot.p0TypeId, pi),
          basics: slot.basicFactories,
          p1: commodityName(slot.p1TypeId, pi),
        })
      );
    }
    for (const factory of step.factories) {
      push(
        t('piPlan.stepFactory', {
          count: factory.count,
          product: commodityName(factory.typeId, pi),
        })
      );
    }
  }
  for (const ship of step.ships) {
    // A colony left as it is already sells at the hub: only a new leg is a step.
    if (step.kind === 'as-is' && !ship.isNew) continue;
    const text = t('piPlan.stepShip', {
      item: commodityName(ship.typeId, pi),
      to: endName(ship.to, names),
    });
    push(ship.isNew ? t('piPlan.stepNew', { step: text }) : text);
  }
  if (step.switchTo.length > 0) {
    push(
      switchGainPerDay !== null && clampIskZero(switchGainPerDay, 0) > 0
        ? t('piPlan.stepTipGain', {
            p1s: namesList(step.switchTo, pi),
            isk: signedCompact(switchGainPerDay),
          })
        : t('piPlan.stepTip', { p1s: namesList(step.switchTo, pi) }),
      'tip'
    );
  }
  if (lines.length === 0) return null;
  return (
    <ul className="col-span-full space-y-0.5 pl-1 text-[0.6875rem] text-text-dim">
      {lines.map((line) => (
        <li key={line.key} className={line.tone === 'tip' ? 'italic' : undefined}>
          {line.text}
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
