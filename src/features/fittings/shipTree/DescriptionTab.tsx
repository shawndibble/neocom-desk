import { useTranslation } from 'react-i18next';
import type { ShipTreeShip } from '@/sde/types';
import { TraitList } from './TraitList';
import type { ShipTreeSource } from './useShipTreeData';

const tag = 'rounded-xs border border-line px-1.5 py-0.5 text-xs text-text-dim';

/** Ship Info › Description: class and faction, the bonuses, then CCP's description. */
export function DescriptionTab({ ship, source }: { ship: ShipTreeShip; source: ShipTreeSource }) {
  const { t } = useTranslation();
  const group = source.data.groups[String(ship.treeGroupID)];
  const faction = source.data.factions.find((f) => f.id === ship.factionID);
  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        {group && (
          <span className={tag} title={group.description}>
            {group.name}
          </span>
        )}
        {faction && (
          <span className={tag} title={faction.description}>
            {faction.name}
          </span>
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
