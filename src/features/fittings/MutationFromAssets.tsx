/**
 * "Load rolls from my assets" in the module dialog's Mutation section: the
 * active Character's own abyssal items of the types this module can be,
 * each with its real base, mutaplasmid and rolls (ESI's dynamic item, kept
 * for good once read — `features/abyssal/dynamicItems.ts`). Picking one
 * makes the module that item. Asked only on a press, so opening the dialog
 * never reads assets or ESI.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import { rollRows } from '@/engine/fittings/mutationEdit';
import type { ItemMutation } from '@/engine/fittings/types';
import { mutationsForItems } from '@/features/abyssal/dynamicItems';
import { loadCharacterAssets } from '@/features/character/assets';
import { loadTypeDetail } from '@/features/skills/typeDetail';

interface OwnedItem {
  itemId: number;
  mutation: ItemMutation;
  /** Mean roll quality, 0–1; null when the base's values won't load. */
  quality: number | null;
}

type Found =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'failed' }
  | { kind: 'done'; items: OwnedItem[]; unread: number };

/** Mean quality of `mutation`'s rolls against its base's own values. */
async function meanQuality(
  mutation: ItemMutation,
  lookup: MutaplasmidLookup
): Promise<number | null> {
  const detail = await loadTypeDetail(mutation.baseTypeId).catch(() => null);
  if (!detail?.dogma_attributes) return null;
  const values = new Map(detail.dogma_attributes.map((a) => [a.attribute_id, a.value] as const));
  const rows = rollRows(
    mutation.mutaplasmidTypeId,
    mutation.attributes,
    (id) => values.get(id),
    lookup
  ).filter((row) => row.rolled);
  if (rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + row.quality, 0) / rows.length;
}

async function findOwned(
  characterId: number,
  typeIds: ReadonlySet<number>,
  lookup: MutaplasmidLookup
): Promise<{ items: OwnedItem[]; unread: number }> {
  const { cached } = await loadCharacterAssets(characterId);
  const refs = (cached?.data ?? [])
    .filter((asset) => typeIds.has(asset.type_id))
    .map((asset) => ({ typeId: asset.type_id, itemId: asset.item_id }));
  if (refs.length === 0) return { items: [], unread: 0 };
  const mutations = await mutationsForItems(refs, lookup);
  const items = await Promise.all(
    refs.flatMap((ref) => {
      const mutation = mutations.get(ref.itemId);
      if (!mutation) return [];
      return [
        meanQuality(mutation, lookup).then((quality) => ({
          itemId: ref.itemId,
          mutation,
          quality,
        })),
      ];
    })
  );
  // Best first: the one a pilot most likely fits.
  items.sort((a, b) => (b.quality ?? -1) - (a.quality ?? -1));
  return { items, unread: refs.length - items.length };
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

  async function search() {
    setFound({ kind: 'loading' });
    try {
      setFound({ kind: 'done', ...(await findOwned(characterId, typeIds, lookup)) });
    } catch {
      setFound({ kind: 'failed' });
    }
  }

  if (found.kind === 'idle' || found.kind === 'loading') {
    return (
      <Button size="sm" loading={found.kind === 'loading'} onClick={() => void search()}>
        {t('fittings.mutation.fromAssets')}
      </Button>
    );
  }
  if (found.kind === 'failed') {
    return (
      <p className="text-danger" role="alert">
        {t('fittings.mutation.fromAssetsFailed')}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-text-dim">
        {found.items.length === 0
          ? t('fittings.mutation.fromAssetsNone')
          : t('fittings.mutation.fromAssetsCount', { count: found.items.length })}
        {found.unread > 0 && ` ${t('fittings.mutation.fromAssetsUnread', { count: found.unread })}`}
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
