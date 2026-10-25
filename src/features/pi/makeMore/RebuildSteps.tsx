import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox, TypeIcon } from '@/components/ui';
import { tappableRowClassName, touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import type { PiPinKind } from '@/sde/types';
import { cx } from '@/lib/cx';
import { LoadMeter, VerbTag } from '../DirectiveRow';
import { Sentence } from '../sentence';
import type { ChecklistColumn, ChecklistStep } from '../planView';
import { ItemLink, Minutes, type Ticks } from './shared';

const PIN_KEY: Record<PiPinKind, string> = {
  extractorControlUnit: 'extractor',
  basic: 'basic',
  advanced: 'advanced',
  highTech: 'highTech',
  storage: 'storage',
  launchpad: 'launchpad',
};

const PIN_ICON: Record<PiPinKind, ReactNode> = {
  extractorControlUnit: <Icon.PiExtractor size={Icon.ICON_SIZE.md} />,
  basic: <Icon.PiFactory size={Icon.ICON_SIZE.md} />,
  advanced: <Icon.PiFactory size={Icon.ICON_SIZE.md} />,
  highTech: <Icon.PiFactory size={Icon.ICON_SIZE.md} />,
  storage: <Icon.Container size={Icon.ICON_SIZE.md} />,
  launchpad: <Icon.PiLaunchpad size={Icon.ICON_SIZE.md} />,
};

function StepText({ step }: { step: ChecklistStep }) {
  const { t } = useTranslation();
  const rawPin = step.pin
    ? t(`piPlan.make.pin.${PIN_KEY[step.pin]}`, { count: step.count ?? 1 })
    : '';
  const pin = rawPin.charAt(0).toUpperCase() + rawPin.slice(1);
  switch (step.verb) {
    case 'upgrade':
      return <>{t('piPlan.make.step.upgrade', { level: step.toLevel })}</>;
    case 'remove':
      return <>{t('piPlan.make.step.remove', { count: step.count ?? 1, pin })}</>;
    case 'place':
      return (
        <>
          {t(
            step.pin === 'extractorControlUnit'
              ? 'piPlan.make.step.placeExtractor'
              : 'piPlan.make.step.place',
            { count: step.count ?? 1, pin }
          )}
        </>
      );
    case 'set':
      return (
        <Sentence
          text={t('piPlan.make.step.set', { pin, item: '{item}', count: step.count ?? 1 })}
          slots={{
            item:
              step.typeId !== null && step.subject !== null ? (
                <ItemLink item={{ typeId: step.typeId, name: step.subject }} />
              ) : null,
          }}
        />
      );
    case 'route':
      return (
        <>
          <Sentence
            text={t('piPlan.make.step.route', { item: '{item}' })}
            slots={{ item: <b className="font-semibold">{step.carries}</b> }}
          />
        </>
      );
  }
}

/** Which of the shared tag looks a step takes; its label is the step's own. */
const STEP_TAG = {
  upgrade: 'build',
  remove: 'remove',
  place: 'add',
  set: 'start',
  route: 'rebuild',
} as const;

function StepIcon({ step }: { step: ChecklistStep }) {
  if (step.verb === 'upgrade') return <Icon.PiCommandCenter size={Icon.ICON_SIZE.md} />;
  if (step.verb === 'route') return <Icon.PiLaunchpad size={Icon.ICON_SIZE.md} />;
  if (step.verb === 'set' && step.typeId !== null)
    return <TypeIcon typeId={step.typeId} size={32} width={20} height={20} />;
  return step.pin ? PIN_ICON[step.pin] : null;
}

function StepVerb({ verb }: { verb: ChecklistStep['verb'] }) {
  const { t } = useTranslation();
  return <VerbTag verb={STEP_TAG[verb]} label={t(`piPlan.make.verb.${verb}`)} />;
}

/**
 * A rebuild's in-game steps, opened in its own row: the row already names the
 * planet and the change, so the steps carry no header of their own.
 */
export function RebuildSteps({
  id,
  column,
  ticks,
}: {
  id: string;
  column: ChecklistColumn;
  ticks: Ticks;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const { fit } = column;
  return (
    <section
      id={id}
      aria-label={t('piPlan.make.steps.region', { name: column.name })}
      className="mt-2 bg-panel-2"
    >
      <ul className="divide-y divide-line">
        {column.steps.map((step) => {
          const ticked = ticks.has(step.id);
          const textId = `${baseId}-${step.id}`;
          return (
            <li
              key={step.id}
              className={cx(tappableRowClassName, 'flex items-center gap-2 px-3 py-1.5')}
            >
              <label className={cx(touchCheckboxLabelClassName, 'max-md:size-9')}>
                <Checkbox
                  checked={ticked}
                  onChange={() => ticks.toggle(step.id)}
                  aria-labelledby={textId}
                />
              </label>
              <StepVerb verb={step.verb} />
              <span className="inline-flex shrink-0 text-text-dim">
                <StepIcon step={step} />
              </span>
              <span
                id={textId}
                className={cx('min-w-0 flex-1 text-xs', ticked && 'text-text-dim line-through')}
              >
                <StepText step={step} />
              </span>
              <span className="max-sm:hidden">
                <Minutes value={Math.max(1, Math.round(step.minutes))} />
              </span>
            </li>
          );
        })}
      </ul>
      {fit && (
        <div className="grid gap-x-6 gap-y-1 border-t border-line px-3 py-2 sm:grid-cols-[auto_minmax(0,14rem)_minmax(0,14rem)] sm:items-center">
          <p
            className={cx(
              'text-[0.6875rem]',
              fit.upgradeFromLevel !== null ? 'text-warning' : 'text-text-dim'
            )}
          >
            {fit.upgradeFromLevel !== null
              ? t('piPlan.make.fitNeedsUpgrade', {
                  level: fit.level,
                  count: fit.level - fit.upgradeFromLevel,
                  steps: fit.level - fit.upgradeFromLevel,
                })
              : t('piPlan.make.fitsCc', { level: fit.level })}
          </p>
          <LoadMeter label={t('piPlan.make.cpu')} used={fit.cpuPercent} budget={100} />
          <LoadMeter label={t('piPlan.make.power')} used={fit.powerPercent} budget={100} />
        </div>
      )}
    </section>
  );
}
