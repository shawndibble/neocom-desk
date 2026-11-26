import { useTranslation } from 'react-i18next';
import { Spinner, StatChip, StatChips, Tooltip } from '@/components/ui';
import type { CharacterAttributes } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';

const ATTRIBUTE_ORDER = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;

interface AttributeChipsProps {
  attributes: CharacterAttributes | null;
  implantBonuses: Implants;
  boosterBonus?: number;
  dense?: boolean;
  short?: boolean;
  loading?: boolean;
}

export function AttributeChips({
  attributes,
  implantBonuses,
  boosterBonus = 0,
  dense = false,
  short = false,
  loading = false,
}: AttributeChipsProps) {
  const { t } = useTranslation();
  return (
    <StatChips dense={dense}>
      {loading && !attributes ? (
        <Spinner size="sm" />
      ) : attributes ? (
        ATTRIBUTE_ORDER.map((name) => {
          const effective = attributes[name];
          const implant = implantBonuses[name] ?? 0;
          const base = effective - implant - boosterBonus;
          const terms = { base, implant, booster: boosterBonus, effective };
          let breakdown: string | null = null;
          if (implant && boosterBonus) {
            breakdown = t('skills.attributeBreakdownBoth', terms);
          } else if (implant) {
            breakdown = t('skills.attributeBreakdownImplant', terms);
          } else if (boosterBonus) {
            breakdown = t('skills.attributeBreakdownBooster', terms);
          }
          return (
            <StatChip
              key={name}
              label={t(short ? `skills.attrShort.${name}` : `skills.attr.${name}`)}
              value={
                breakdown ? (
                  <Tooltip content={breakdown} openOnTap>
                    <span
                      tabIndex={0}
                      className="cursor-help rounded-xs focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {effective}
                      <span className="sr-only"> {breakdown}</span>
                    </span>
                  </Tooltip>
                ) : (
                  effective
                )
              }
              tone={breakdown ? 'accent' : 'default'}
            />
          );
        })
      ) : (
        <span className="text-xs text-text-dim">{t('common.unknown')}</span>
      )}
    </StatChips>
  );
}
