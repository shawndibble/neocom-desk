import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { itemAttributeSections, withSkilledValues } from '@/engine/market/itemAttributeSections';
import { useSkilledAttributes } from '@/features/fittings/useSkilledAttributes';
import { loadAttributeReferenceNames } from '@/features/market/attributeReferenceNames';
import { ItemAttributeSections } from '@/features/market/ItemAttributeSections';
import { SkilledValuesNote } from '@/features/market/SkilledValuesNote';
import { sectionsShowSkilled } from '@/features/market/skilledFigures';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadAttributeDictionary } from '@/sde/loadMarketSde';
import type { ShipTreeShip } from '@/sde/types';
import { TraitList } from './TraitList';
import type { ShipTreeSource } from './useShipTreeData';

// Plain static text: a box here would read as a control (DESIGN.md §6c).
const tag = 'px-1 py-0.5 text-xs text-text-dim';

/** Ship Info › Attributes: class and faction, the bonuses, CCP's description (collapsed), then the hull's attributes. */
export function AttributesTab({ ship, source }: { ship: ShipTreeShip; source: ShipTreeSource }) {
  const { t } = useTranslation();
  const [flavorOpen, setFlavorOpen] = useState(false);
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
        <Disclosure
          label={t('ships.info.flavorText')}
          expanded={flavorOpen}
          onToggle={() => setFlavorOpen((open) => !open)}
        >
          <p className="pb-2 text-sm leading-relaxed whitespace-pre-line text-text">
            {ship.description}
          </p>
        </Disclosure>
      )}
      <HullAttributes typeId={ship.typeID} />
    </div>
  );
}

/** The hull's dogma attributes as Show info prints them, "base → skilled" where the pilot's skills change one. */
function HullAttributes({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const load = useCallback(async () => {
    const [type, dictionary] = await Promise.all([
      loadTypeDetail(typeId),
      loadAttributeDictionary(),
    ]);
    if (!type) throw new Error(`No type data for ${typeId}`);
    const names = await loadAttributeReferenceNames([type.dogma_attributes], dictionary);
    return itemAttributeSections(type.dogma_attributes, dictionary, names, {
      kind: 'hull',
      omitSkillRequirementRows: true,
    });
  }, [typeId]);
  const base = useKeyedLoad(String(typeId), load);
  const skilled = useSkilledAttributes(typeId);
  const sections = useMemo(
    () =>
      base.data && skilled.status === 'ready'
        ? withSkilledValues(base.data, skilled.values)
        : (base.data ?? []),
    [base.data, skilled]
  );

  if (base.status === 'failed') {
    return <p className="text-text-dim">{t('ships.info.attributesError')}</p>;
  }
  if (sections.length === 0) return null;
  return (
    <div className="space-y-3">
      <SkilledValuesNote state={skilled} changed={sectionsShowSkilled(sections)} key={typeId} />
      <ItemAttributeSections
        sections={sections}
        skilledSources={skilled.status === 'ready' ? skilled.sources : undefined}
      />
    </div>
  );
}
