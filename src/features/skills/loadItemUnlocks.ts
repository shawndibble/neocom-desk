/**
 * Loads the ships, modules and other items a skill unlocks (`skillItemUnlocks.json`
 * joined with `types.json` / `groupCategories.json`), for every surface that
 * renders `SkillRequirementsList`.
 */
import { useEffect, useState } from 'react';
import { loadGroupCategories, loadSkillItemUnlocks, loadTypes } from '@/sde/loadSde';
import { buildItemUnlocks, type ItemUnlockRow } from './skillUnlockLevels';

/** The items `typeID` unlocks; none when that data can't load, so the skill still shows. */
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

/** `loadItemUnlocks` for a selected skill (null: none); empty until it resolves. */
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
