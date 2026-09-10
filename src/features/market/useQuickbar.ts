/**
 * The Quickbar record for the active character, plus the writes every surface
 * that offers "Add to Quickbar" needs. Three pages now own an
 * `ItemContextMenu` — the Market Browser, Assets and Industry's materials
 * table — and each needs the same Dexie put + sync schedule; keeping one copy
 * means a new surface cannot forget the `isSyncConfigured()` guard.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type QuickbarItem } from '@/db';
import { scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import { addQuickbarItem, setQuickbarItemTarget } from './quickbar';

export interface Quickbar {
  /** Empty until the live query resolves, and with nobody active. */
  items: QuickbarItem[];
  /** False with no active character — the Quickbar has nobody to save an item under. */
  available: boolean;
  /** Replaces the whole list — the shape reorder/remove/bulk-add already work in. */
  write: (items: QuickbarItem[]) => Promise<void>;
  /** Fire-and-forget single add, deduped by typeId. Matches `ItemContextMenu`'s handler signature. */
  add: (typeId: number, itemName: string) => void;
  /** Fire-and-forget target set/clear (issue #680). `null` clears the item's price alert. */
  setTarget: (
    typeId: number,
    target: { price: number; direction: 'above' | 'below' } | null
  ) => void;
}

export function useQuickbar(activeCharacterId: number | null): Quickbar {
  const record = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.quickbars.get(String(activeCharacterId));
  }, [activeCharacterId]);
  const items = record?.items ?? [];

  async function write(next: QuickbarItem[]) {
    if (activeCharacterId === null) return;
    await db.quickbars.put({
      id: String(activeCharacterId),
      characterId: activeCharacterId,
      items: next,
      updatedAt: Date.now(),
    });
    if (isSyncConfigured()) scheduleSync(activeCharacterId);
  }

  return {
    items,
    available: activeCharacterId !== null,
    write,
    add: (typeId, itemName) => void write(addQuickbarItem(items, { typeId, name: itemName })),
    setTarget: (typeId, target) => void write(setQuickbarItemTarget(items, typeId, target)),
  };
}
