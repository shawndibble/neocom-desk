import { useTranslation } from 'react-i18next';
import { StatChip } from '@/components/ui';
import type { CharacterAttributes } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';

const ATTRIBUTE_ORDER = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;

interface AttributeChipsProps {
  /** ESI's attributes for the character, or null when they could not be read. */
  attributes: CharacterAttributes | null;
  implantBonuses: Implants;
}

/**
 * The five character attributes as chips. Shared by the trained view and the
 * plan list's side pane so the base/effective arithmetic lives in one place —
 * ESI reports the *effective* value, so the base is what's left once the
 * implant bonus comes off, and only the bonus case spells all three out.
 *
 * `null` attributes render as unknown rather than as a plausible-looking
 * sheet: a character's attributes are the input every training estimate is
 * built on, so inventing them would be worse than showing nothing.
 */
export function AttributeChips({ attributes, implantBonuses }: AttributeChipsProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-4">
      {attributes ? (
        ATTRIBUTE_ORDER.map((name) => {
          const effective = attributes[name];
          const bonus = implantBonuses[name] ?? 0;
          const base = effective - bonus;
          return (
            <StatChip
              key={name}
              label={t(`skills.attr.${name}`)}
              value={bonus ? t('skills.attributeEffective', { base, bonus, effective }) : base}
              tone={bonus ? 'accent' : 'default'}
            />
          );
        })
      ) : (
        <span className="text-xs text-text-dim">{t('common.unknown')}</span>
      )}
    </div>
  );
}
