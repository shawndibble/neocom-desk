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
