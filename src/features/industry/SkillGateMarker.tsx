/**
 * Marks a build row whose blueprint no character on the account can install.
 * Shared by Market-Wide Build Opportunities and Build Plan detail's sub-build
 * rows so the two surfaces never say the shortfall differently. Only renders
 * for a gated verdict — there's no positive "you can build this" state.
 */
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { romanLevel } from '@/engine/projection';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';

export interface SkillGateMarkerProps {
  verdict: Extract<SkillGateVerdict, { gated: true }>;
  nameForSkill: (typeID: number) => string;
  nameForCharacter: (characterId: number) => string;
}

export function SkillGateMarker({ verdict, nameForSkill, nameForCharacter }: SkillGateMarkerProps) {
  const { t } = useTranslation();
  const { shortfall, bestCharacterId } = verdict;
  const label =
    shortfall.length === 1
      ? t('industry.skillGateMarkerSingle', {
          skill: nameForSkill(shortfall[0]!.typeID),
          level: romanLevel(shortfall[0]!.needLevel),
        })
      : t('industry.skillGateMarkerMany', { count: shortfall.length });

  return (
    <Tooltip
      openOnTap
      content={
        <span className="flex flex-col gap-1">
          <span className="font-semibold">{t('industry.skillGateTooltipTitle')}</span>
          {shortfall.map((s) => (
            <span key={s.typeID}>
              {t('industry.skillGateShortfallRow', {
                skill: nameForSkill(s.typeID),
                have: s.haveLevel === 0 ? '—' : romanLevel(s.haveLevel),
                need: romanLevel(s.needLevel),
              })}
            </span>
          ))}
          <span>
            {t('industry.skillGateBestOn', { character: nameForCharacter(bestCharacterId) })}
          </span>
        </span>
      }
    >
      <span
        role="img"
        aria-label={`${t('industry.skillGateTooltipTitle')}: ${label}`}
        // The shortfall rows and the best character live only in the tooltip,
        // so a keyboard has to be able to open it (WCAG 2.1.1).
        tabIndex={0}
        className="inline-flex shrink-0 items-center gap-1 text-warning focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Icon.SkillLocked size={Icon.ICON_SIZE.sm} />
        <span className="text-[0.6875rem] whitespace-nowrap">{label}</span>
      </span>
    </Tooltip>
  );
}
