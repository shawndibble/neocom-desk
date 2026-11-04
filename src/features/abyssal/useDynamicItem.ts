/**
 * A Mutated module's dynamic item (`dynamicItems.ts`): base, mutaplasmid and
 * full attribute set.
 */
import { useEffect, useMemo, useState } from 'react';
import type { DynamicItemRecord } from '@/db';
import type { ItemMutation } from '@/engine/fittings/types';
import { getDynamicItem, mutationFromRecord } from './dynamicItems';
import { useMutaplasmidLookup } from './mutaplasmidData';

export type DynamicItemState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'ready'; record: DynamicItemRecord }
  | { status: 'failed' };

/** `none` without an item id; `failed` when neither the cache nor ESI has the item. */
export function useDynamicItem(typeId: number, itemId: number | undefined): DynamicItemState {
  const key = itemId === undefined ? null : `${typeId}:${itemId}`;
  const [answer, setAnswer] = useState<{ key: string; state: DynamicItemState } | null>(null);
  useEffect(() => {
    if (itemId === undefined) return;
    const asked = `${typeId}:${itemId}`;
    let live = true;
    getDynamicItem({ typeId, itemId }).then(
      (record) => {
        if (live) {
          setAnswer({
            key: asked,
            state: record ? { status: 'ready', record } : { status: 'failed' },
          });
        }
      },
      () => {
        if (live) setAnswer({ key: asked, state: { status: 'failed' } });
      }
    );
    return () => {
      live = false;
    };
  }, [typeId, itemId]);
  if (key === null) return { status: 'none' };
  return answer?.key === key ? answer.state : { status: 'loading' };
}

/**
 * The Mutated module's mutation (base, mutaplasmid, its rolls) once the item
 * has loaded and this build's mutaplasmid data agrees with it; null
 * otherwise. What "This module's rolls" shows, so Item Detail can leave those
 * attributes out of its groups.
 */
export function useDynamicItemMutation(
  typeId: number,
  dynamic: DynamicItemState
): ItemMutation | null {
  const lookup = useMutaplasmidLookup();
  return useMemo(
    () =>
      lookup && dynamic.status === 'ready'
        ? mutationFromRecord(typeId, dynamic.record, lookup)
        : null,
    [lookup, dynamic, typeId]
  );
}
