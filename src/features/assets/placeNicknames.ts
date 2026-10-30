/**
 * The pilot's own name for a station or structure, shown on the Assets page only.
 *
 * A Place Nickname is a display-layer label (decision 20261030-082351): it is
 * applied where Assets draws a location name, and never in place resolution,
 * the name loaders, shares, URLs or Industry plan data, so it cannot reach
 * another person. The real name stays beside it.
 *
 * Synced like `sync.cloneNicknames`: one blob keyed by location id (a station
 * or structure id, which may exceed 2^31 but is a safe integer), exact-match
 * allow-listed, last-write-wins as a whole. Clearing drops the entry; the key
 * is never deleted, so the tombstone-expiry edge in syncedSettings.ts does not
 * bite it.
 */
import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_PLACE_NICKNAMES_KEY = 'sync.placeNicknames';

/** Longer than a sensible label; keeps one bad paste from bloating the synced blob. */
export const PLACE_NICKNAME_MAX = 64;

export type PlaceNicknamesValue = Record<number, string>;

function clean(name: string): string {
  return name.trim().slice(0, PLACE_NICKNAME_MAX);
}

/** The stored blob with blank or non-string entries dropped. */
export function parsePlaceNicknames(raw: unknown): PlaceNicknamesValue {
  return (
    parseCharacterKeyedRecord<string>(raw, (value) =>
      typeof value === 'string' && clean(value) !== '' ? clean(value) : null
    ) ?? {}
  );
}

/** The value with one location's nickname set; a blank name removes the entry. */
export function withPlaceNickname(
  value: PlaceNicknamesValue,
  locationId: number,
  name: string
): PlaceNicknamesValue {
  const next = { ...value };
  const cleaned = clean(name);
  if (cleaned === '') delete next[locationId];
  else next[locationId] = cleaned;
  return next;
}

export const usePlaceNicknames = createSyncedSetting<PlaceNicknamesValue>({
  key: SYNCED_PLACE_NICKNAMES_KEY,
  defaultValue: {},
  parse: parsePlaceNicknames,
});

/**
 * Sets one location's nickname. Hydrates first: merged into the empty default
 * before the stored blob is read, a save would push a one-entry blob that
 * wipes every other nickname on every device.
 */
export async function savePlaceNickname(locationId: number, name: string): Promise<void> {
  await usePlaceNicknames.getState().hydrate();
  const { value, setValue } = usePlaceNicknames.getState();
  await setValue(withPlaceNickname(value, locationId, name));
}

/** The nicknames for rendering, hydrating the store so a deep link does not show the default. */
export function usePlaceNicknameMap(): PlaceNicknamesValue {
  useHydratedStore(usePlaceNicknames);
  return usePlaceNicknames((state) => state.value);
}
