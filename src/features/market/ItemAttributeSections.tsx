/**
 * Item Detail's attribute sections (`itemAttributeSections`): each group a
 * heading over name/value rows, and the shield/armor/hull resistances as the
 * Fittings Defense table (`ResistTable`) with each layer's HP under its name.
 * A row or layer the pilot's skills change (`withSkilledValues`) reads
 * "base → skilled", the base dim and the pilot's value emphasised.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import type { DisplayAttribute } from '@/engine/market/itemAttributes';
import type { AttributeSection, ResistLayer } from '@/engine/market/itemAttributeSections';
import { ResistTable, type ResistRow } from '@/features/fittings/stats/ResistTable';
import { formatAttributeValue } from './format';
import { rowValueText, skilledChange, skilledHpChange, type SkilledChange } from './skilledFigures';

const SECTION_HEADING = cx(eyebrowClassName, 'border-b border-line pb-1');

/** "base → skilled" (§6c): the base dim, the pilot's value emphasised, spoken as a sentence. */
function SkilledFigure({ change }: { change: SkilledChange }) {
  const { t } = useTranslation();
  return (
    <>
      <span aria-hidden className="tabular-nums">
        <span className="text-text-dim">{change.base} → </span>
        <span className="font-semibold">{change.skilled}</span>
      </span>
      <span className="sr-only">{t('market.itemDetail.skilled.change', change.spoken)}</span>
    </>
  );
}

/** A row's value: "base → skilled" when the pilot changes it, else the one value. */
function attributeValue(attribute: DisplayAttribute): ReactNode {
  const change = skilledChange(attribute);
  return change ? <SkilledFigure change={change} /> : rowValueText(attribute);
}

function ResistSection({ layers }: { layers: ResistLayer[] }) {
  const { t } = useTranslation();
  const rows: ResistRow[] = layers.map((layer) => {
    const hpChange = skilledHpChange(layer);
    const sub =
      layer.hp === null ? undefined : hpChange ? (
        <SkilledFigure change={hpChange} />
      ) : (
        t('market.itemDetail.layerHp', { value: formatAttributeValue(layer.hp) })
      );
    return {
      key: layer.layer,
      label: t(`fittings.stats.${layer.layer}`),
      ...(sub === undefined ? {} : { sub }),
      // The pilot's resists, each cell reading "base → skilled" where they print differently.
      resonances: layer.skilled?.resonances ?? layer.resonances,
      ...(layer.skilled ? { baseResonances: layer.resonances } : {}),
    };
  });
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
  renderValue = (_, content) => content,
}: {
  sections: readonly AttributeSection[];
  /** Wraps a row's value, e.g. in the "which skill changes this" popover. */
  renderValue?: (attribute: DisplayAttribute, content: ReactNode) => ReactNode;
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
                {renderValue(attribute, attributeValue(attribute))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    )
  );
}
