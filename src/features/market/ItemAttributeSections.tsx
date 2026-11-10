/**
 * Item Detail's attribute sections (`itemAttributeSections`): each group a
 * heading over name/value rows, and the shield/armor/hull resistances as the
 * Fittings Defense table (`ResistTable`) with each layer's HP under its name.
 * A row, HP or resist the pilot's skills change (`withSkilledValues`) reads
 * "base → skilled" (`SkilledValue`): the pilot's figure green, opening what
 * made it.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import type { DisplayAttribute } from '@/engine/market/itemAttributes';
import {
  LAYER_ATTRIBUTES,
  type AttributeSection,
  type ResistLayer,
} from '@/engine/market/itemAttributeSections';
import { ResistTable, type ResistRow } from '@/features/fittings/stats/ResistTable';
import { RESONANCE_KEY } from '@/features/fittings/stats/resistFormat';
import type { NamedSkilledSource } from '@/features/fittings/useSkilledAttributes';
import { formatAttributeValue } from './format';
import { SkilledValue } from './SkilledValue';
import { rowValueText, skilledChange, skilledHpChange } from './skilledFigures';

const SECTION_HEADING = cx(eyebrowClassName, 'border-b border-line pb-1');

/** What made each skilled value, by attribute id (`useSkilledAttributes`). */
type SourcesById = ReadonlyMap<number, readonly NamedSkilledSource[]>;

function ResistSection({ layers, sources }: { layers: ResistLayer[]; sources?: SourcesById }) {
  const { t } = useTranslation();
  const rows: ResistRow[] = layers.map((layer) => {
    const ids = LAYER_ATTRIBUTES.find((entry) => entry.layer === layer.layer);
    const label = t(`fittings.stats.${layer.layer}`);
    const hpChange = skilledHpChange(layer);
    const sub =
      layer.hp === null ? undefined : hpChange ? (
        <SkilledValue
          base={hpChange.base}
          skilled={hpChange.skilled}
          spoken={t('market.itemDetail.skilled.change', hpChange.spoken)}
          label={t('market.itemDetail.layerHpLabel', { layer: label })}
          sources={(ids && sources?.get(ids.hp)) ?? []}
        />
      ) : (
        t('market.itemDetail.layerHp', { value: formatAttributeValue(layer.hp) })
      );
    return {
      key: layer.layer,
      label,
      ...(sub === undefined ? {} : { sub }),
      // The pilot's resists, each cell reading "base → skilled" where they print differently.
      resonances: layer.skilled?.resonances ?? layer.resonances,
      ...(layer.skilled ? { baseResonances: layer.resonances } : {}),
      renderSkilled: (type, base, value) => (
        <SkilledValue
          base={base}
          skilled={`${value}%`}
          spoken={t('fittings.stats.skilledResist', { base, value })}
          label={t('market.itemDetail.resistLabel', {
            layer: label,
            type: t(`fittings.stats.damageTypeShort.${type}`),
          })}
          sources={(ids && sources?.get(ids.resonances[RESONANCE_KEY[type]])) ?? []}
        />
      ),
    };
  });
  return (
    <div>
      <h3 className={SECTION_HEADING}>{t('market.itemDetail.resistsTitle')}</h3>
      <div className="mt-1">
        <ResistTable rows={rows} />
      </div>
    </div>
  );
}

export function ItemAttributeSections({
  sections,
  skilledSources,
  renderSkillList,
}: {
  sections: readonly AttributeSection[];
  /** What made each skilled value; a changed figure opens these. */
  skilledSources?: SourcesById;
  /**
   * The skills that change a row, for its popover (null when none do): on a
   * changed figure they join the sources; on an unchanged one they are all it
   * opens, from the plain base number. One number, one trigger either way.
   */
  renderSkillList?: (attribute: DisplayAttribute) => ReactNode;
}) {
  const { t } = useTranslation();
  return sections.map((section) =>
    section.kind === 'resists' ? (
      <ResistSection key="resists" layers={section.layers} sources={skilledSources} />
    ) : (
      <div key={section.group.category}>
        <h3 className={SECTION_HEADING}>{section.group.category}</h3>
        <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          {section.group.attributes.map((attribute) => {
            const change = skilledChange(attribute);
            const skillList = renderSkillList?.(attribute);
            return (
              <div key={attribute.attributeId} className="contents">
                <dt className="text-text-dim">{attribute.name}</dt>
                <dd className="text-right text-text">
                  {change ? (
                    <SkilledValue
                      base={change.base}
                      skilled={change.skilled}
                      spoken={t('market.itemDetail.skilled.change', change.spoken)}
                      label={attribute.name}
                      sources={skilledSources?.get(attribute.attributeId) ?? []}
                      extra={skillList}
                    />
                  ) : skillList ? (
                    <SkilledValue
                      neutral
                      skilled={rowValueText(attribute)}
                      spoken={`${rowValueText(attribute)} ${t('market.itemDetail.modifiersFor', { attribute: attribute.name })}`}
                      label={attribute.name}
                      sources={[]}
                      extra={skillList}
                    />
                  ) : (
                    rowValueText(attribute)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    )
  );
}
