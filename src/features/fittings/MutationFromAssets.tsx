/**
 * "Load rolls from my assets": the active Character's abyssal items of the
 * types this module can be, each with its real base, mutaplasmid and rolls
 * (`features/abyssal/dynamicItems.ts`). Only on a press, so opening the dialog never reads assets or ESI.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GrantMissingLink } from '@/app/GrantMissingLink';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button } from '@/components/ui';
import type { MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import { rollRows, type BaseValue } from '@/engine/fittings/mutationEdit';
import type { ItemMutation } from '@/engine/fittings/types';
import { mutationsForItems } from '@/features/abyssal/dynamicItems';
import { loadCharacterAssets } from '@/features/assets/assets';
import { useRetryFocus } from '@/lib/useRetryFocus';
import { loadBaseValues } from './loadBaseValues';

interface OwnedItem {
  itemId: number;
  mutation: ItemMutation;
  /** Mean roll quality, 0–1; null when the base's values won't load. */
  quality: number | null;
}

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
  // Best first: the one a pilot most likely fits.
  items.sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
  return { items, unread: refs.length - items.length, truncated };
}

export function MutationFromAssets({
  characterId,
  typeIds,
  lookup,
  nameOf,
  onApply,
}: {
  characterId: number;
  /** The abyssal types to look for. */
  typeIds: ReadonlySet<number>;
  lookup: MutaplasmidLookup;
  nameOf: (typeId: number) => string;
  onApply: (mutation: ItemMutation) => void;
}) {
  const { t } = useTranslation();
  const [found, setFound] = useState<Found>({ kind: 'idle' });
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
  return (
    <div ref={listRef} tabIndex={-1} className="w-full space-y-1 focus:outline-none">
      <p className="text-text-dim">
        {found.items.length === 0
          ? t('fittings.mutation.fromAssetsNone')
          : t('fittings.mutation.fromAssetsCount', { count: found.items.length })}
        {found.unread > 0 && ` ${t('fittings.mutation.fromAssetsUnread', { count: found.unread })}`}
        {found.truncated && ` ${t('fittings.mutation.fromAssetsTruncated')}`}
      </p>
      {found.items.length > 0 && (
        <ul className="space-y-1">
          {found.items.map((item) => (
            <li key={item.itemId}>
              <Button
                size="sm"
                align="start"
                className="w-full max-w-md"
                onClick={() => onApply(item.mutation)}
              >
                <span className="min-w-0 truncate">
                  {t('fittings.mutation.ownedItem', {
                    base: nameOf(item.mutation.baseTypeId),
                    mutaplasmid: nameOf(item.mutation.mutaplasmidTypeId),
                  })}
                </span>
                {item.quality !== null && (
                  <span className="ml-auto shrink-0 pl-2 text-text-dim tabular-nums">
                    {t('fittings.mutation.ownedQuality', { pct: Math.round(item.quality * 100) })}
                  </span>
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
