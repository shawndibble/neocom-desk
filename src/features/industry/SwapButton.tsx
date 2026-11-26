import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import type { SkillGateVerdict } from '@/engine/industry/skillGate';
import { formatIskCompact } from '@/lib/isk';
import { MakeOrBuyTooltip } from './MakeOrBuyMarker';
import { BUILD_GLYPH } from './makeOrBuyText';
import { SkillGateMarker } from './SkillGateMarker';
import { linkClassName } from './materialsTableStyle';
import type { MaterialTableRow } from './subBuildPlan';

export function SwapButton({
  material,
  name,
  kind,
  advice,
  skillGate,
  nameForCharacter,
  nameForSkill,
  onClick,
}: {
  material: MaterialTableRow;
  name: string;
  kind: 'build' | 'buy';
  advice: MakeOrBuy | undefined;
  skillGate?: SkillGateVerdict;
  nameForCharacter?: (characterId: number) => string;
  nameForSkill?: (typeID: number) => string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const savings =
    kind === 'build' &&
    advice?.verdict === 'build' &&
    advice.savings > 0 &&
    material.remainingQuantity > 0
      ? advice.savings
      : null;
  const Glyph = kind === 'build' ? BUILD_GLYPH[advice?.method ?? 'manufacturing'] : Icon.Buy;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5">
      <Tooltip
        content={
          <MakeOrBuyTooltip advice={advice} remaining={material.remainingQuantity} action={kind} />
        }
      >
        <button
          type="button"
          data-swap-for={material.typeID}
          data-swap-kind={kind}
          aria-label={t(kind === 'build' ? 'industry.buildHereFor' : 'industry.buyInsteadFor', {
            material: name,
          })}
          className={linkClassName(savings !== null ? 'build' : 'quiet')}
          onClick={onClick}
        >
          <Glyph size={Icon.ICON_SIZE.sm} aria-hidden="true" />
          {t(kind === 'build' ? 'industry.errands.buildInstead' : 'industry.errands.buyInstead')}
        </button>
      </Tooltip>
      {savings !== null && (
        <span className="text-[0.6875rem] text-success tabular-nums">
          {t('industry.errands.saves', { amount: formatIskCompact(savings) })}
        </span>
      )}
      {kind === 'build' && skillGate?.gated && nameForCharacter && nameForSkill && (
        <SkillGateMarker
          lockOnly
          verdict={skillGate}
          nameForSkill={nameForSkill}
          nameForCharacter={nameForCharacter}
        />
      )}
    </span>
  );
}
