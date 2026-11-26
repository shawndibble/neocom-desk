import { useCallback, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type CharacterAcceleratorRecord } from '@/db';
import { readCachedRows } from '@/esi/cacheRows';
import { acceleratorBonusOf } from '@/engine/attributeBaseline';
import type { CharacterAttributes } from '@/esi/endpoints';
import { KEYS } from '@/features/skills/data';
import { toAttributeBaseline } from '@/features/skills/skillMap';
import { loadImplantTypeBonuses } from '@/features/skills/typeDetail';
import { idSetKey } from '@/lib/idSetKey';
import { useBatchedMap } from '@/lib/useBatchedMap';
import { purgeExpiredAccelerators } from './characterAccelerators';

const NONE: ReadonlyMap<number, CharacterAcceleratorRecord> = new Map();

export function useCharacterAccelerators(): ReadonlyMap<number, CharacterAcceleratorRecord> {
  const rows = useLiveQuery(() => db.characterAccelerators.toArray(), []);
  useEffect(() => {
    if (rows !== undefined) void purgeExpiredAccelerators();
  }, [rows]);
  return useMemo(() => (rows ? new Map(rows.map((row) => [row.characterId, row])) : NONE), [rows]);
}

export async function detectAcceleratorBonus(characterId: number): Promise<number | null> {
  return (await readDetectedAccelerator(characterId))?.bonus ?? null;
}

export async function readDetectedAccelerator(
  characterId: number
): Promise<{ bonus: number | null } | null> {
  try {
    const [attributes, implants] = await Promise.all([
      readCachedRows<CharacterAttributes>([characterId], KEYS.attributes),
      readCachedRows<number[]>([characterId], KEYS.implants),
    ]);
    const sheet = attributes.get(characterId)?.data;
    const worn = implants.get(characterId)?.data;
    if (!sheet || !worn) return null;
    const bonus = acceleratorBonusOf(
      toAttributeBaseline(sheet, await loadImplantTypeBonuses(worn))
    );
    return { bonus: bonus > 0 ? bonus : null };
  } catch {
    return null;
  }
}

export function useDetectedAccelerators(
  characterIds: readonly number[]
): ReadonlyMap<number, number | null> {
  const key = idSetKey(characterIds);
  const load = useCallback((entry: string) => detectAcceleratorBonus(Number(entry)), []);
  const { values } = useBatchedMap(key, load);
  return useMemo(() => new Map([...values].map(([id, bonus]) => [Number(id), bonus])), [values]);
}
