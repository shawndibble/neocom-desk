import { useEffect, useState } from 'react';
import { loadGroupCategories, loadSkillItemUnlocks, loadTypes } from '@/sde/loadSde';
import { buildItemUnlocks, type ItemUnlockRow } from './skillUnlockLevels';

export async function loadItemUnlocks(typeID: number): Promise<ItemUnlockRow[]> {
  try {
    const [index, types, groupCategories] = await Promise.all([
      loadSkillItemUnlocks(),
      loadTypes(),
      loadGroupCategories(),
    ]);
    return buildItemUnlocks(typeID, index, types, groupCategories);
  } catch {
    return [];
  }
}

const NONE: readonly ItemUnlockRow[] = [];

export function useItemUnlocks(typeID: number | null): readonly ItemUnlockRow[] {
  const [loaded, setLoaded] = useState<{ typeID: number; rows: ItemUnlockRow[] } | null>(null);
  useEffect(() => {
    if (typeID === null) return;
    let cancelled = false;
    void loadItemUnlocks(typeID).then((rows) => {
      if (!cancelled) setLoaded({ typeID, rows });
    });
    return () => {
      cancelled = true;
    };
  }, [typeID]);
  return loaded && loaded.typeID === typeID ? loaded.rows : NONE;
}
