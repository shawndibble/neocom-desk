/**
 * One owned abyssal module's dynamic item (`dynamicItems.ts`): its base,
 * mutaplasmid and full attribute set, for Item Detail opened on that item.
 */
import { useEffect, useState } from 'react';
import type { DynamicItemRecord } from '@/db';
import { getDynamicItem } from './dynamicItems';

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
            // The cache is keyed by item id alone: a URL naming another type gets no rolls.
            state:
              record && record.typeId === typeId
                ? { status: 'ready', record }
                : { status: 'failed' },
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
