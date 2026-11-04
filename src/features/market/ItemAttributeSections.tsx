/**
 * Item Detail's attribute sections (`itemAttributeSections`): each group a
 * heading over name/value rows, and the shield/armor/hull resistances as the
 * Fittings Defense table (`ResistTable`) with each layer's HP under its name.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import type { DisplayAttribute } from '@/engine/market/itemAttributes';
import type { AttributeSection, ResistLayer } from '@/engine/market/itemAttributeSections';
import { ResistTable, type ResistRow } from '@/features/fittings/stats/ResistTable';
import { formatAttributeValue } from './format';

const SECTION_HEADING = cx(eyebrowClassName, 'border-b border-line pb-1');

/** An attribute row's value as text: its resolved name, or the number and its unit. */
function attributeValueText(attribute: DisplayAttribute): string {
  return (
    attribute.displayValue ??
    `${formatAttributeValue(attribute.value, attribute.unit)}${attribute.unit ? ` ${attribute.unit}` : ''}`
  );
}

function ResistSection({ layers }: { layers: ResistLayer[] }) {
  const { t } = useTranslation();
  const rows: ResistRow[] = layers.map(({ layer, hp, resonances }) => ({
    key: layer,
    label: t(`fittings.stats.${layer}`),
    ...(hp === null
      ? {}
      : { sub: t('market.itemDetail.layerHp', { value: formatAttributeValue(hp) }) }),
    resonances,
  }));
  return (
    <div>
      <h3 className={SECTION_HEADING}>{t('market.itemDetail.resistsTitle')}</h3>
      {/* Four bars across the whole modal read as one long strip; this keeps each a bar. */}
      <div className="mt-1 max-w-lg">
        <ResistTable rows={rows} />
      </div>
    </div>
  );
}

export function ItemAttributeSections({
  sections,
  renderValue = (_, text) => text,
}: {
  sections: readonly AttributeSection[];
  /** Wraps a row's value text, e.g. in the "which skill changes this" popover. */
  renderValue?: (attribute: DisplayAttribute, text: string) => ReactNode;
}) {
  return sections.map((section) =>
    section.kind === 'resists' ? (
      <ResistSection key="resists" layers={section.layers} />
    ) : (
      <div key={section.group.category}>
        <h3 className={SECTION_HEADING}>{section.group.category}</h3>
        <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          {section.group.attributes.map((attribute) => (
            <div key={attribute.attributeId} className="contents">
              <dt className="text-text-dim">{attribute.name}</dt>
              <dd className="text-right text-text">
                {renderValue(attribute, attributeValueText(attribute))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    )
  );
}
