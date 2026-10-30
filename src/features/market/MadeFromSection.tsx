/**
 * Item Detail's "Made from": the forward recipe for an item a blueprint or
 * reaction formula produces — inputs per run, output per run, base time.
 * Reads `byProductTypeID` (first blueprint wins, like "Used in"). Loads the
 * blueprint catalog on its own and fails to nothing; an item no blueprint
 * makes renders nothing. Base quantities only — no ME/TE, skills or prices.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, TypeIcon } from '@/components/ui';
import {
  loadBlueprintCatalog,
  nameForType,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { ItemInfoLink } from '@/features/entities';
import { useOptionalItemActions } from './itemActions';
import { formatCount } from '@/lib/formatCount';
import { formatDuration } from '@/lib/duration';

export function MadeFromSection({ typeId }: { typeId: number }) {
  const { t } = useTranslation();
  const actions = useOptionalItemActions();
  const [catalog, setCatalog] = useState<BlueprintCatalog | null>(actions?.blueprints ?? null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (catalog) return;
    let cancelled = false;
    loadBlueprintCatalog()
      .then((loaded) => {
        if (!cancelled) setCatalog(loaded);
      })
      .catch(() => {
        // "Made from" is a bonus, not core item detail — a failed load renders nothing.
      });
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  // Show info swaps the open modal to another item without remounting it.
  const [shownFor, setShownFor] = useState(typeId);
  if (shownFor !== typeId) {
    setShownFor(typeId);
    setOpen(true);
  }

  const entry = catalog?.byProductTypeID.get(typeId);
  if (!catalog || !entry) return null;
  const { blueprint } = entry;
  const made = blueprint.products.find((product) => product.typeID === typeId);

  return (
    <section>
      <Disclosure
        label={t(
          blueprint.activity === 'reaction'
            ? 'market.itemDetail.madeFromReaction'
            : 'market.itemDetail.madeFromManufacturing'
        )}
        expanded={open}
        onToggle={() => setOpen((v) => !v)}
        className="border-b border-line"
      >
        <ul className="space-y-0.5 px-2.5 py-1 text-xs text-text">
          {blueprint.materials.map((material) => (
            <li key={material.typeID} className="flex items-center justify-between gap-3 py-0.5">
              <span className="inline-flex min-w-0 items-center gap-2">
                <TypeIcon
                  typeId={material.typeID}
                  size={32}
                  width={20}
                  height={20}
                  className="shrink-0"
                />
                <ItemInfoLink typeId={material.typeID} className="truncate">
                  {nameForType(catalog, material.typeID)}
                </ItemInfoLink>
              </span>
              <span className="shrink-0 tabular-nums text-text-dim">
                {t('market.itemDetail.madeFromPerRun', {
                  quantity: formatCount(material.quantity),
                })}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-2.5 py-1 text-xs text-text-dim">
          {t('market.itemDetail.madeFromFooter', {
            quantity: formatCount(made?.quantity ?? 1),
            duration: formatDuration(blueprint.time),
          })}
        </p>
      </Disclosure>
    </section>
  );
}
