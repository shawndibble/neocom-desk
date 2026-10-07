import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import type { ShipTreeShip } from '@/sde/types';
import { TraitList } from './TraitList';
import type { ShipTreeSource } from './useShipTreeData';

// Plain static text: a box here would read as a control (DESIGN.md §6c).
const tag = 'px-1 py-0.5 text-xs text-text-dim';

/** Ship Info › Description: class and faction, the bonuses, then CCP's description. */
export function DescriptionTab({ ship, source }: { ship: ShipTreeShip; source: ShipTreeSource }) {
  const { t } = useTranslation();
  const group = source.data.groups[String(ship.treeGroupID)];
  const faction = source.data.factions.find((f) => f.id === ship.factionID);
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {group && (
          <HintText content={group.description} className={tag}>
            {group.name}
          </HintText>
        )}
        {faction && (
          <HintText content={faction.description} className={tag}>
            {faction.name}
          </HintText>
        )}
      </div>
      {ship.traits.length > 0 && (
        <section aria-label={t('ships.info.bonuses.title')}>
          <TraitList traits={ship.traits} skillName={source.skillName} tone="app" />
        </section>
      )}
      {ship.description && (
        <p className="text-sm leading-relaxed whitespace-pre-line text-text">{ship.description}</p>
      )}
    </div>
  );
}
