import { useLiveQuery } from 'dexie-react-hooks';
import { db, type QuickbarItem } from '@/db';
import { scheduleSync } from '@/sync';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  addQuickbarItem,
  pinWithTarget,
  setQuickbarItemTarget,
  type QuickbarTarget,
} from './quickbar';

export interface Quickbar {
  items: QuickbarItem[];
  available: boolean;
  write: (items: QuickbarItem[]) => Promise<void>;
  add: (typeId: number, itemName: string) => void;
  setTarget: (typeId: number, target: QuickbarTarget) => void;
  pinWithTarget: (typeId: number, itemName: string, target: QuickbarTarget) => void;
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
    if (isSyncConfigured()) scheduleSync(activeCharacterId, { collections: ['quickbars'] });
  }

  return {
    items,
    available: activeCharacterId !== null,
    write,
    add: (typeId, itemName) => void write(addQuickbarItem(items, { typeId, name: itemName })),
    setTarget: (typeId, target) => void write(setQuickbarItemTarget(items, typeId, target)),
    pinWithTarget: (typeId, itemName, target) =>
      void write(pinWithTarget(items, typeId, itemName, target)),
  };
}
