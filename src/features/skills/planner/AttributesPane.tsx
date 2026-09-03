import { useTranslation } from 'react-i18next';
import { DataAgeBadge, Panel } from '@/components/ui';
import { AttributeChips } from '@/features/skills/AttributeChips';
import { formatLocalDate } from '@/lib/localDate';
import type { CachedResult } from '@/features/skills/data';
import type { RemapAvailability } from './remapAvailability';
import { acceleratorBonusOf, type AttributeBaseline } from '@/engine/attributeBaseline';
import type { CharacterAttributes } from '@/esi/endpoints';
import type { Implants } from '@/engine/types';

interface AttributesPaneProps {
  /** ESI's attributes read, carrying its own age; null when it could not be read. */
  result: CachedResult<CharacterAttributes> | null;
  implantBonuses: Implants;
  /** How the base sheet was arrived at — null until ESI has been read at all. */
  attributeBaseline?: AttributeBaseline | null;
  remapInfo: RemapAvailability | null;
  className?: string;
}

/**
 * The character's current attributes, filling the plan list's detail pane
 * until a plan is opened (#158 put a "select a plan" placeholder there, which
 * said only what the list beside it already said). Attributes are the input
 * every plan is costed against and the thing a remap changes, so this is
 * reference the planner wants in view, not a duplicate of the trained view.
 *
 * The editor route wants the same reference for the same reason and shows the
 * same `AttributeChips` + `DataAgeBadge` pair — but as a section inside
 * `PlanToolsPane`, not as another panel, because its sidebar already carries
 * the plan list and the tools panel. See `PlanEditor`'s `attributes` section.
 */
export function AttributesPane({
  result,
  implantBonuses,
  attributeBaseline = null,
  remapInfo,
  className,
}: AttributesPaneProps) {
  const { t } = useTranslation();
  return (
    <Panel
      title={t('skills.attributes')}
      className={className}
      actions={result?.fetchedAt && <DataAgeBadge date={result.fetchedAt} />}
    >
      <AttributeChips
        attributes={result?.data ?? null}
        implantBonuses={implantBonuses}
        boosterBonus={acceleratorBonusOf(attributeBaseline)}
      />
      {remapInfo && (
        <p className="mt-3 text-xs text-text-dim">
          {remapInfo.yearlyReady
            ? t('plans.remapFromEveReady', { bonus: remapInfo.bonus })
            : t('plans.remapFromEveCooldown', {
                bonus: remapInfo.bonus,
                date: remapInfo.cooldownUntil ? formatLocalDate(remapInfo.cooldownUntil) : '',
              })}
        </p>
      )}
    </Panel>
  );
}
