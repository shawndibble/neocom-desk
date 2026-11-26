import { useTranslation } from 'react-i18next';
import { SkillLink } from '@/features/entities';
import { COMMAND_CENTER_UPGRADES_SKILL_ID } from './colonyBudget';
import { Sentence } from './sentence';

export function CcLevelTag({ level }: { level: number }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex h-[1.125rem] items-center gap-1 rounded-xs border border-warning/60 px-1.5 text-[0.6875rem] font-semibold whitespace-nowrap text-warning">
      <Sentence
        text={t('piPlan.find.needsCc', { level, skill: '{skill}' })}
        slots={{
          skill: (
            <SkillLink typeId={COMMAND_CENTER_UPGRADES_SKILL_ID}>
              {t('piPlan.find.needsCcSkill', { level })}
            </SkillLink>
          ),
        }}
      />
    </span>
  );
}
