import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Disclosure, IskAmount, TypeIcon } from '@/components/ui';
import {
  loadBlueprintCatalog,
  nameForType,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { ItemInfoLink } from '@/features/entities';
import { useOptionalItemActions } from './itemActions';
import { cx } from '@/lib/cx';
import { formatCount } from '@/lib/formatCount';
import { formatDuration } from '@/lib/duration';
import { formatSignedPercent, savingTone } from '@/lib/formatSignedPercent';
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { marginOnBestSell, runInputCost } from './madeFromCost';
import { useKeyedLoad } from '@/lib/useAsyncLoad';

export interface MadeFromPricing {
  hub: TradeHub;
  bestSell: number | null | undefined;
}

export function MadeFromSection({
  typeId,
  pricing,
}: {
  typeId: number;
  pricing?: MadeFromPricing;
}) {
  const { t } = useTranslation();
  const actions = useOptionalItemActions();
  const [open, setOpen] = useState(true);

  const loadedCatalog = useKeyedLoad('catalog', loadBlueprintCatalog, !!actions?.blueprints);
  const catalog: BlueprintCatalog | null = actions?.blueprints ?? loadedCatalog.data ?? null;

  const [shownFor, setShownFor] = useState(typeId);
  if (shownFor !== typeId) {
    setShownFor(typeId);
    setOpen(true);
  }

  const entry = catalog?.byProductTypeID.get(typeId);
  const inputs = entry?.blueprint.materials;
  const hub = pricing?.hub;
  const [inputCost, setInputCost] = useState<{
    inputs: typeof inputs;
    stationId: number;
    cost: number | null;
  } | null>(null);
  useEffect(() => {
    if (!hub || !inputs || inputs.length === 0) return;
    let cancelled = false;
    getHubPrices(
      hub,
      inputs.map((input) => input.typeID)
    ).then(
      (aggregates) => {
        if (!cancelled)
          setInputCost({
            inputs,
            stationId: hub.stationId,
            cost: runInputCost(inputs, aggregates),
          });
      },
      () => undefined
    );
    return () => {
      cancelled = true;
    };
  }, [hub, inputs]);

  if (!catalog || !entry || entry.blueprint.materials.length === 0) return null;
  const { blueprint } = entry;
  const made = blueprint.products.find((product) => product.typeID === typeId);
  const cost =
    inputCost && inputCost.inputs === inputs && inputCost.stationId === hub?.stationId
      ? inputCost.cost
      : null;
  const margin =
    cost === null ? null : marginOnBestSell(cost, pricing?.bestSell, made?.quantity ?? 1);

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
                {t('market.itemDetail.usedInPerRun', {
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
        {cost !== null && hub && (
          <p className="flex flex-wrap gap-x-4 px-2.5 py-1 text-xs text-text-dim">
            <span>
              {t('market.itemDetail.madeFromCost', { hub: hub.stationLabel })}{' '}
              <span className="tabular-nums text-text">
                <IskAmount value={cost} />
              </span>
            </span>
            {margin !== null && (
              <span>
                {t('market.itemDetail.madeFromMargin')}{' '}
                <span
                  className={cx(
                    'tabular-nums',
                    savingTone(margin) === 'good' ? 'text-isk-pos' : 'text-isk-neg'
                  )}
                >
                  {formatSignedPercent(margin)}
                </span>
              </span>
            )}
            <span className="basis-full">{t('market.itemDetail.madeFromCostHint')}</span>
          </p>
        )}
      </Disclosure>
    </section>
  );
}
