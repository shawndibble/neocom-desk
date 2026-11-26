import { db } from '@/db';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

export interface FanOutCharacter {
  characterId: number;
  name: string;
}

interface FanOutResult<T> {
  entries: T[];
  skipped: FanOutCharacter[];
}

interface FanOutOptions<T> {
  scope?: string;
  characters?: readonly FanOutCharacter[];
  load: (character: FanOutCharacter) => Promise<T | null>;
}

export async function fanOutAllCharacters<T>({
  scope,
  characters,
  load,
}: FanOutOptions<T>): Promise<FanOutResult<T>> {
  const all: readonly FanOutCharacter[] = characters ?? (await db.characters.toArray());
  let granted: boolean[] = all.map(() => true);
  if (scope !== undefined) {
    const tokens = await db.tokens.bulkGet(all.map((c) => c.characterId));
    granted = tokens.map((token) => (token?.scopes ?? []).includes(scope));
  }

  const toFetch = all.filter((_, i) => granted[i]);
  const noScope = all.filter((_, i) => !granted[i]).map(pick);

  const slots: (T | null)[] = new Array(toFetch.length).fill(null);
  await mapWithConcurrencyLimit(
    toFetch.map((character, index) => ({ character, index })),
    ESI_FANOUT_CONCURRENCY,
    async ({ character, index }) => {
      try {
        slots[index] = await load(character);
      } catch {
        slots[index] = null;
      }
    }
  );

  const entries: T[] = [];
  const failed: FanOutCharacter[] = [];
  slots.forEach((slot, i) => {
    if (slot === null) failed.push(pick(toFetch[i]));
    else entries.push(slot);
  });
  return { entries, skipped: [...noScope, ...failed] };
}

function pick({ characterId, name }: FanOutCharacter): FanOutCharacter {
  return { characterId, name };
}
