import { useTranslation } from 'react-i18next';
import { StatChip, Tooltip } from '@/components/ui';
import { cx } from '@/lib/cx';
import type { CharacterAttributes } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';

const ATTRIBUTE_ORDER = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'] as const;

interface AttributeChipsProps {
  /** ESI's attributes for the character, or null when they could not be read. */
  attributes: CharacterAttributes | null;
  implantBonuses: Implants;
  /**
   * The uniform per-attribute bonus a detected cerebral accelerator adds
   * (`engine/attributeBaseline.ts`'s `acceleratorBonus`, when its baseline is
   * `accelerated`) — one number, not per-attribute, since the detection
   * arithmetic only works because the bonus is the same on all five. Omit or
   * pass 0 when no booster was detected (including an `impossible` sheet,
   * where nothing explains the excess and inventing a figure would be worse
   * than showing none).
   */
  boosterBonus?: number;
  /**
   * Tighter gaps, for the plan editor's 20rem sidebar. Five chips whose
   * labels are whole words ("INTELLIGENCE") wrap to four or five rows in a
   * column that narrow, and the roomy `gap-4` that reads well across a
   * full-width pane turns them into a block taller than the controls beneath
   * it. A prop rather than a `className` override because two `gap-*`
   * utilities in one class list resolve by stylesheet order, not by which
   * caller wrote theirs last.
   */
  dense?: boolean;
}

/**
 * The five character attributes as chips. Shared by the trained view, the
 * plan list's side pane and the plan editor's tools pane so the base/effective
 * arithmetic lives in one place — ESI reports the *effective* value, so the
 * base is what's left once the implant bonus comes off.
 *
 * The chip shows the effective total and nothing else: that total is the
 * number every training estimate is costed against, and five chips each
 * spelling out "21 base + 4 implant + 4 booster = 29" made a strip of sums to
 * read rather than a sheet to scan. The terms are one hover, focus or tap
 * away instead, on the total itself — the same treatment `IskAmount` gives a
 * rounded figure, for the same reason.
 *
 * `null` attributes render as unknown rather than as a plausible-looking
 * sheet: a character's attributes are the input every training estimate is
 * built on, so inventing them would be worse than showing nothing.
 */
export function AttributeChips({
  attributes,
  implantBonuses,
  boosterBonus = 0,
  dense = false,
}: AttributeChipsProps) {
  const { t } = useTranslation();
  return (
    <div className={cx('flex flex-wrap', dense ? 'gap-x-2 gap-y-1.5' : 'gap-2 sm:gap-4')}>
      {attributes ? (
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
              label={t(`skills.attr.${name}`)}
              // No bonus means base and effective are the same number, so a
              // bubble reading "20 base = 20" would be a hover that says
              // nothing. The bare total stays bare.
              value={
                breakdown ? (
                  // The total as real text with the breakdown after it,
                  // hidden visually — not an `aria-label`, which a role-less
                  // span may not carry (see `IskAmount`).
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
    </div>
  );
}
