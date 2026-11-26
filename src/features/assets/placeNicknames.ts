import { parseCharacterKeyedRecord } from '@/lib/characterKeyedRecord';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const SYNCED_PLACE_NICKNAMES_KEY = 'sync.placeNicknames';

export const PLACE_NICKNAME_MAX = 64;

export type PlaceNicknamesValue = Record<number, string>;

function clean(name: string): string {
  return name.trim().slice(0, PLACE_NICKNAME_MAX);
}

export function parsePlaceNicknames(raw: unknown): PlaceNicknamesValue {
  return (
    parseCharacterKeyedRecord<string>(raw, (value) =>
      typeof value === 'string' && clean(value) !== '' ? clean(value) : null
    ) ?? {}
  );
}

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

export async function savePlaceNickname(locationId: number, name: string): Promise<void> {
  await usePlaceNicknames.getState().hydrate();
  const { value, setValue } = usePlaceNicknames.getState();
  await setValue(withPlaceNickname(value, locationId, name));
}

export function usePlaceNicknameMap(): PlaceNicknamesValue {
  useHydratedStore(usePlaceNicknames);
  return usePlaceNicknames((state) => state.value);
}
