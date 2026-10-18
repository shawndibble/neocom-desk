/**
 * Characters an officer unlinked from an automatic group (D26), per
 * corporation, so the next sync does not put them straight back. Device-local
 * and not synced: it is a "stop re-grouping" memory about this browser's
 * account, not Editable Data (GLOSSARY.md).
 */
import { db } from '@/db';

const KEY = 'corpTaxBook.declinedGrouping';
type Record_ = Record<string, number[]>;

async function read(): Promise<Record_> {
  const row = await db.settings.get(KEY);
  const v = row?.value;
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record_) : {};
}

export async function declinedCharacterIds(corporationId: number): Promise<Set<number>> {
  return new Set((await read())[String(corporationId)] ?? []);
}

export async function declineAutoGroup(corporationId: number, characterId: number): Promise<void> {
  const all = await read();
  const ids = new Set(all[String(corporationId)] ?? []);
  ids.add(characterId);
  await db.settings.put({ key: KEY, value: { ...all, [String(corporationId)]: [...ids] } });
}
