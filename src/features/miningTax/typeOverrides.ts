import { db } from '@/db';
import { isSyncConfigured } from '@/app/syncStatus';
import { scheduleSync, setSyncedSetting } from '@/sync';

const MOON_ORE_SETTINGS_KEY = 'sync.miningTaxManualMoonOreTypeIds';
const IGNORED_SETTINGS_KEY = 'sync.miningTaxManualIgnoredTypeIds';
const LEGACY_MOON_ORE_SETTINGS_KEY = 'miningTax.manualMoonOreTypeIds';
const LEGACY_IGNORED_SETTINGS_KEY = 'miningTax.manualIgnoredTypeIds';

async function loadTypeIdList(key: string, legacyKey: string): Promise<number[]> {
  const record = await db.settings.get(key);
  if (record !== undefined) return Array.isArray(record.value) ? (record.value as number[]) : [];
  const legacy = await db.settings.get(legacyKey);
  if (legacy === undefined) return [];
  const value = Array.isArray(legacy.value) ? (legacy.value as number[]) : [];
  await db.settings.put({ key, value });
  return value;
}

async function writeTypeIdList(key: string, value: number[]): Promise<void> {
  await db.settings.put({ key, value });
  if (!isSyncConfigured()) return;
  try {
    await setSyncedSetting(key, value);
    const characters = await db.characters.toArray();
    for (const character of characters)
      scheduleSync(character.characterId, { collections: ['settings'] });
  } catch {}
}

async function addTypeIdToList(key: string, legacyKey: string, typeId: number): Promise<void> {
  const existing = await loadTypeIdList(key, legacyKey);
  if (existing.includes(typeId)) return;
  await writeTypeIdList(key, [...existing, typeId]);
}

async function removeTypeIdFromList(key: string, legacyKey: string, typeId: number): Promise<void> {
  const existing = await loadTypeIdList(key, legacyKey);
  if (!existing.includes(typeId)) return;
  await writeTypeIdList(
    key,
    existing.filter((id) => id !== typeId)
  );
}

export function loadManualMoonOreTypeIds(): Promise<number[]> {
  return loadTypeIdList(MOON_ORE_SETTINGS_KEY, LEGACY_MOON_ORE_SETTINGS_KEY);
}

export function tagAsMoonOre(typeId: number): Promise<void> {
  return addTypeIdToList(MOON_ORE_SETTINGS_KEY, LEGACY_MOON_ORE_SETTINGS_KEY, typeId);
}

export function loadManualIgnoredTypeIds(): Promise<number[]> {
  return loadTypeIdList(IGNORED_SETTINGS_KEY, LEGACY_IGNORED_SETTINGS_KEY);
}

export function tagAsIgnored(typeId: number): Promise<void> {
  return addTypeIdToList(IGNORED_SETTINGS_KEY, LEGACY_IGNORED_SETTINGS_KEY, typeId);
}

export function untagMoonOre(typeId: number): Promise<void> {
  return removeTypeIdFromList(MOON_ORE_SETTINGS_KEY, LEGACY_MOON_ORE_SETTINGS_KEY, typeId);
}

export function untagIgnored(typeId: number): Promise<void> {
  return removeTypeIdFromList(IGNORED_SETTINGS_KEY, LEGACY_IGNORED_SETTINGS_KEY, typeId);
}

export interface TypeOverrides {
  moonOreTypeIds: number[];
  ignoredTypeIds: number[];
}

export async function loadTypeOverrides(): Promise<TypeOverrides> {
  const [moonOreTypeIds, ignoredTypeIds] = await Promise.all([
    loadManualMoonOreTypeIds(),
    loadManualIgnoredTypeIds(),
  ]);
  return { moonOreTypeIds, ignoredTypeIds };
}
