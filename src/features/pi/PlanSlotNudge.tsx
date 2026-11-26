import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import { InfoTooltip, IskAmount, textActionClassName } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { SkillLink } from '@/features/entities';
import { cx } from '@/lib/cx';
import { formatIskCompact } from '@/lib/isk';
import { INTERPLANETARY_CONSOLIDATION_SKILL_ID } from './planetSlots';
import type { PlanAdvice } from './planAdviceModel';
import { Sentence } from './sentence';

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
  compact = false,
}: {
  slots: PlanAdvice['slots'];
  onFindBest?: () => void;
  compact?: boolean;
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
  const sentence = [
    t('piPlan.make.slots', {
      count: slots.allowed,
      used: slots.used,
      gain: slots.gainPerPlanetPerDay === null ? '' : formatIskCompact(slots.gainPerPlanetPerDay),
      skill: t('piPlan.make.slotsSkill'),
      context: slots.gainPerPlanetPerDay === null ? 'nogain' : undefined,
    }),
    slots.assumed ? t('piPlan.make.slotsAssumed') : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className="space-y-1.5 border-t border-line px-3 py-3 text-xs text-text">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={eyebrowClassName}>{t('piPlan.make.slotsLocked')}</span>
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
        {compact ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-text-dim">
              {t('piPlan.make.slotsLabel', { used: slots.used, count: slots.allowed })}
            </span>
            <InfoTooltip label={t('piPlan.make.slotsInfoLabel')} glyph="info" content={sentence} />
            {slots.gainPerPlanetPerDay !== null && (
              <span className="text-isk-pos">
                <Gain value={slots.gainPerPlanetPerDay} />{' '}
                <span className="text-text-dim">{t('piPlan.make.slotsGainEach')}</span>
              </span>
            )}
            {slots.assumed && (
              <span className="text-text-dim">({t('piPlan.make.slotsAssumedShort')})</span>
            )}
            <span aria-hidden="true" className="text-text-dim">
              ·
            </span>
            <SkillLink typeId={INTERPLANETARY_CONSOLIDATION_SKILL_ID}>
              {t('piPlan.make.slotsSkill')}
            </SkillLink>
          </span>
        ) : (
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
        )}
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
