/**
 * "Load rolls from my assets": the active Character's abyssal items of the
 * types this module can be, each with its real base, mutaplasmid and rolls
 * (`features/abyssal/dynamicItems.ts`). Only on a press, so opening the dialog never reads assets or ESI.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button, SegmentedControl } from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import type { MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import { rollRows, type BaseValue } from '@/engine/fittings/mutationEdit';
import type { FittingSlotKind, ItemMutation } from '@/engine/fittings/types';
import { AbyssalEstimateLine } from '@/features/abyssal/AbyssalEstimateLine';
import { mutationsForItems } from '@/features/abyssal/dynamicItems';
import { loadCharacterAssets } from '@/features/assets/assets';
import { fixed1 } from '@/lib/fixedFormat';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useRetryFocus } from '@/lib/useRetryFocus';
import type { VariantEvaluator } from './evaluationBasis';
import { ChangesCell } from './FittingVariationsPanel';
import { loadBaseValues } from './loadBaseValues';
import {
  RANK_CAP,
  byQuality,
  evaluateOwned,
  sortOwned,
  topByQuality,
  type OwnedEffect,
  type OwnedItem,
  type OwnedSort,
} from './ownedMutationRanking';

type Found =
  { kind: 'idle' } | { kind: 'loading' } | { kind: 'failed' } | ({ kind: 'done' } & Owned);

interface Owned {
  items: OwnedItem[];
  /** Matching items whose rolls ESI didn't give. */
  unread: number;
  /** The asset list was cut short, so "none" may be wrong. */
  truncated: boolean;
}

/** Longer than assetShipLocation's 8 s: the user is waiting on a visible rolls panel, not a background open. */
const ROLLS_TIMEOUT_MS = 15_000;

/** Mean quality of `mutation`'s rolls against its base's own values. */
async function meanQuality(
  mutation: ItemMutation,
  baseValues: Promise<BaseValue | null>,
  lookup: MutaplasmidLookup
): Promise<number | null> {
  const baseValue = await baseValues;
  if (baseValue === null) return null;
  const rows = rollRows(mutation.mutaplasmidTypeId, mutation.attributes, baseValue, lookup).filter(
    (row) => row.rolled
  );
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.quality, 0) / rows.length;
}

async function findOwned(
  characterId: number,
  typeIds: ReadonlySet<number>,
  lookup: MutaplasmidLookup
): Promise<Owned> {
  const { cached } = await loadCharacterAssets(characterId);
  // No list at all (ESI didn't answer, nothing saved) is unknown, never "none".
  if (cached === null) throw new Error('assets unread');
  const truncated = cached.truncated;
  const refs = cached.data
    .filter((asset) => typeIds.has(asset.type_id))
    .map((asset) => ({ typeId: asset.type_id, itemId: asset.item_id }));
  if (refs.length === 0) return { items: [], unread: 0, truncated };
  const mutations = await mutationsForItems(refs, lookup, {
    signal: AbortSignal.timeout(ROLLS_TIMEOUT_MS),
  });
  // Many owned items share a base: read each base's values once.
  const bases = new Map<number, Promise<BaseValue | null>>();
  const baseValuesOf = (typeId: number) => {
    let values = bases.get(typeId);
    if (!values) bases.set(typeId, (values = loadBaseValues(typeId)));
    return values;
  };
  const items = await Promise.all(
    refs.flatMap((ref) => {
      const mutation = mutations.get(ref.itemId);
      if (!mutation) return [];
      return [
        meanQuality(mutation, baseValuesOf(mutation.baseTypeId), lookup).then((quality) => ({
          itemId: ref.itemId,
          mutation,
          quality,
        })),
      ];
    })
  );
  // Best-rolled first until the fit's effect is known.
  return {
    items: items.sort(byQuality),
    unread: refs.length - items.length,
    truncated,
  };
}

export function MutationFromAssets({
  characterId,
  typeIds,
  lookup,
  nameOf,
  onApply,
  variants,
  slot,
  slotIndex,
}: {
  characterId: number;
  /** The abyssal types to look for. */
  typeIds: ReadonlySet<number>;
  lookup: MutaplasmidLookup;
  nameOf: (typeId: number) => string;
  onApply: (mutation: ItemMutation) => void;
  /** The open Fitting's evaluator; null (still loading) leaves the list in quality order. */
  variants: VariantEvaluator | null;
  slot: FittingSlotKind;
  slotIndex: number;
}) {
  const { t } = useTranslation();
  const [found, setFound] = useState<Found>({ kind: 'idle' });
  const [sort, setSort] = useState<OwnedSort>('effect');
  const [ranked, setRanked] = useState<{
    items: readonly OwnedItem[];
    variants: VariantEvaluator;
    effects: ReadonlyMap<number, OwnedEffect>;
  } | null>(null);
  // Rows whose price the pilot asked for: nothing calls MutaMarket until then.
  const [estimating, setEstimating] = useState<ReadonlySet<number>>(new Set());
  const focusAfterCommit = useFocusAfterCommit();
  const doneItems = found.kind === 'done' ? found.items : null;

  // The top `RANK_CAP` by quality, one worker compare each, once the list is
  // up (so only after the press that loaded it).
  useEffect(() => {
    if (!doneItems || !variants || doneItems.length === 0) return;
    const controller = new AbortController();
    void evaluateOwned({
      variants,
      slot,
      slotIndex,
      items: topByQuality(doneItems),
      lookup,
      signal: controller.signal,
    }).then((effects) => {
      if (!controller.signal.aborted) setRanked({ items: doneItems, variants, effects });
    });
    return () => controller.abort();
  }, [doneItems, variants, slot, slotIndex, lookup]);
  const lacksScope = useCharacterLacksEndpoints(characterId, ['getCharacterAssets']);
  // The button stays mounted until the list replaces it; then focus moves to the list.
  const [listRef, armListFocus] = useRetryFocus(
    found.kind === 'done' ? 'ok' : found.kind === 'failed' ? 'failed' : 'busy',
    characterId
  );

  async function search() {
    armListFocus();
    setFound({ kind: 'loading' });
    try {
      setFound({ kind: 'done', ...(await findOwned(characterId, typeIds, lookup)) });
    } catch {
      setFound({ kind: 'failed' });
    }
  }

  if (lacksScope) {
    return (
      <p className="text-text-dim">
        {t('fittings.mutation.fromAssetsNeedsPermission')} <GrantMissingLink groups={['assets']} />
      </p>
    );
  }
  if (found.kind !== 'done') {
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        {found.kind === 'failed' && (
          <span className="text-warning" role="alert">
            {t('fittings.mutation.fromAssetsFailed')}
          </span>
        )}
        <Button size="sm" loading={found.kind === 'loading'} onClick={() => void search()}>
          {found.kind === 'failed' ? t('common.retry') : t('fittings.mutation.fromAssets')}
        </Button>
      </div>
    );
  }
  const current = ranked?.items === found.items && ranked.variants === variants ? ranked : null;
  const effects = current?.effects ?? new Map<number, OwnedEffect>();
  const evaluating = variants !== null && current === null;
  const topIds = new Set(topByQuality(found.items).map((item) => item.itemId));
  return (
    <div ref={listRef} tabIndex={-1} className="w-full space-y-1 focus:outline-none">
      <p className="text-text-dim">
        {found.items.length === 0
          ? t('fittings.mutation.fromAssetsNone')
          : t('fittings.mutation.fromAssetsCount', { count: found.items.length })}
        {found.unread > 0 && ` ${t('fittings.mutation.fromAssetsUnread', { count: found.unread })}`}
        {found.truncated && ` ${t('fittings.mutation.fromAssetsTruncated')}`}
      </p>
      {found.items.length > 0 && variants && (
        <div className="flex flex-wrap items-center gap-2">
          {found.items.length > 1 && (
            <SegmentedControl
              size="sm"
              label={t('fittings.mutation.sortLabel')}
              value={sort}
              onChange={setSort}
              options={[
                { value: 'effect', label: t('fittings.mutation.sortEffect') },
                { value: 'quality', label: t('fittings.mutation.sortQuality') },
              ]}
            />
          )}
          {found.items.length > RANK_CAP && (
            <span className="text-text-dim">
              {t('fittings.mutation.rankedCap', { shown: RANK_CAP, count: found.items.length })}
            </span>
          )}
        </div>
      )}
      {found.items.length > 0 && (
        <ul className="space-y-2">
          {sortOwned(found.items, effects, sort).map((item) => {
            const effect = effects.get(item.itemId);
            const abyssalTypeId = lookup.resultingType(
              item.mutation.baseTypeId,
              item.mutation.mutaplasmidTypeId
            );
            return (
              <li key={item.itemId} className="max-w-md space-y-1">
                <Button
                  size="sm"
                  align="start"
                  className="w-full"
                  onClick={() => onApply(item.mutation)}
                >
                  <span className="min-w-0 truncate">
                    {t('fittings.mutation.ownedItem', {
                      base: nameOf(item.mutation.baseTypeId),
                      mutaplasmid: nameOf(item.mutation.mutaplasmidTypeId),
                    })}
                  </span>
                  {item.quality !== null && (
                    <Pill className="ml-auto shrink-0">
                      {t('fittings.mutation.ownedQuality', {
                        pct: Math.round(item.quality * 100),
                      })}
                    </Pill>
                  )}
                </Button>
                {variants && (
                  <div className="px-1">
                    {effect ? (
                      <>
                        <ChangesCell delta={effect.delta} t={t} />
                        {!effect.fits && (
                          <p className="text-warning">
                            {effect.overage
                              ? t('fittings.variations.stillOverBy', {
                                  amount: fixed1(effect.overage.amount),
                                  resource: t(`fittings.list.${effect.overage.resource}`),
                                })
                              : t('fittings.variations.fitsNo')}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-text-dim">
                        {evaluating && topIds.has(item.itemId)
                          ? t('common.loading')
                          : t('fittings.mutation.notRanked')}
                      </span>
                    )}
                  </div>
                )}
                {abyssalTypeId !== null &&
                  (estimating.has(item.itemId) ? (
                    <div
                      id={`owned-estimate-${item.itemId}`}
                      tabIndex={-1}
                      className="px-1 focus:outline-none"
                    >
                      <AbyssalEstimateLine
                        typeId={abyssalTypeId}
                        itemId={item.itemId}
                        characterId={characterId}
                      />
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEstimating((open) => new Set(open).add(item.itemId));
                        // The button that ran this unmounts: focus the estimate that replaces it.
                        focusAfterCommit(() =>
                          document.getElementById(`owned-estimate-${item.itemId}`)
                        );
                      }}
                    >
                      {t('fittings.mutation.estimatePrice')}
                    </Button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
