import { useTranslation } from 'react-i18next';
import { acceleratorBonusOf, type AttributeBaseline } from '@/engine/attributeBaseline';
import type { Implants } from '@/engine/types';
import type { CharacterAttributes } from '@/esi/endpoints';
import { AttributeChips } from '@/features/skills/AttributeChips';
import type { CachedResult } from '../../data';

/** The tools pane's Attributes section: the character's own sheet, never re-rendered through the what-if lens. */
export function AttributesToolSection({
  attributesResult,
  implants,
  attributeBaseline,
}: {
  attributesResult: CachedResult<CharacterAttributes> | null;
  implants: Implants;
  attributeBaseline: AttributeBaseline | null;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 text-xs">
      {/* The clone's real sheet, never re-rendered through the what-if
              lens below: "current" has to keep meaning current, or the one
              honest reading of the character on this page becomes another
              hypothetical. The lens's effect is visible where it belongs —
              in the plan's own numbers. */}
      <AttributeChips
        attributes={attributesResult?.data ?? null}
        implantBonuses={implants}
        boosterBonus={acceleratorBonusOf(attributeBaseline)}
        dense
        short
      />
      {/* An impossible sheet is reported, never quietly approximated: the
              scheduler below is running on the placeholder spread, and a
              number presented without that caveat is the bug this fixes. */}
      {attributeBaseline?.kind === 'impossible' && (
        <p className="text-warning">
          {t('plans.attributesImpossible', { total: attributeBaseline.reportedTotal })}
        </p>
      )}
    </div>
  );
}
