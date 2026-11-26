import { db } from '@/db';

const KEY = 'corpOverlapAcks';

export const overlapAckKey = (
  corporationId: number,
  characterId: number,
  date: string,
  solarSystemId: number
) => `${corporationId}:${characterId}:${date}:${solarSystemId}`;

export async function readOverlapAcks(): Promise<Set<string>> {
  try {
    const raw = (await db.settings.get(KEY))?.value;
    return new Set(Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export async function acknowledgeOverlap(key: string): Promise<void> {
  const held = await readOverlapAcks();
  held.add(key);
  await db.settings.put({ key: KEY, value: [...held] });
}
