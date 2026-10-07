/**
 * Planet-slot nudge ("you can run up to 6 planets; you're using 2") shared by
 * both Plan questions, plus the signed ISK-a-day figure it and the make-more
 * cards use.
 */
import { useTranslation } from 'react-i18next';
import { IskAmount, textActionClassName } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SkillLink } from '@/features/entities';
import { cx } from '@/lib/cx';
import { INTERPLANETARY_CONSOLIDATION_SKILL_ID } from './planetSlots';
import type { PlanAdvice } from './planAdviceModel';
import { Sentence } from './sentence';

/** "+95k/day": a signed ISK a day figure, green when it adds and red when it costs. */
export function Gain({ value, className }: { value: number; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cx('tabular-nums', value < 0 ? 'text-isk-neg' : 'text-isk-pos', className)}>
      {value < 0 ? '−' : '+'}
      <IskAmount value={Math.abs(value)} decimals={0} />
      {t('piPlan.make.perDay')}
    </span>
  );
}

export function SlotNudge({
  slots,
  onFindBest,
}: {
  slots: PlanAdvice['slots'];
  /** Absent where the pilot is already looking at the next planet. */
  onFindBest?: () => void;
}) {
  const { t } = useTranslation();
  if (slots.free <= 0) return null;
  const dots = Array.from({ length: slots.allowed }, (_, i) => i < slots.used);
  const text = t('piPlan.make.slots', {
    count: slots.allowed,
    used: slots.used,
    gain: '{gain}',
    skill: '{skill}',
    context: slots.gainPerPlanetPerDay === null ? 'nogain' : undefined,
  });
  return (
    <div className="space-y-1.5 border-t border-line px-3 py-3 text-xs text-text">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* A status, not an action: type and colour, no box (DESIGN-RULES). */}
        <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('piPlan.make.slotsLocked')}
        </span>
        <span
          role="img"
          aria-label={t('piPlan.make.slotsLabel', { used: slots.used, count: slots.allowed })}
          className="flex shrink-0 gap-1"
        >
          {dots.map((used, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cx(
                'size-4 rounded-full',
                used ? 'bg-accent-dim' : 'border border-dashed border-line-bright'
              )}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 max-md:basis-full">
          <Sentence
            text={text}
            slots={{
              gain:
                slots.gainPerPlanetPerDay === null ? null : (
                  <Gain value={slots.gainPerPlanetPerDay} />
                ),
              skill: (
                <SkillLink typeId={INTERPLANETARY_CONSOLIDATION_SKILL_ID}>
                  {t('piPlan.make.slotsSkill')}
                </SkillLink>
              ),
            }}
          />
          {slots.assumed && ` ${t('piPlan.make.slotsAssumed')}`}
        </span>
      </div>
      {onFindBest && (
        <button type="button" className={textActionClassName('gap-1')} onClick={onFindBest}>
          {t('piPlan.make.nextPlanet')}
          <Icon.Descend size={Icon.ICON_SIZE.sm} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
