/**
 * The one place an "every Character" read is fanned out.
 *
 * Owns, so no feature re-implements them:
 * - **Scope pre-check.** When `scope` is given, a Character whose token lacks
 *   it (or has no token) goes to `skipped` and `load` is never called. A live
 *   403 is an auth failure that raises the app-wide re-auth banner naming an
 *   alt the player never asked about, so it is never left to happen.
 * - **Classification.** `load` throwing, or returning `null` (nothing usable,
 *   e.g. nothing cached), puts the Character in `skipped`. A Character that
 *   holds the scope but whose live call answers `needsReauth` is the
 *   caller's call: return an entry carrying that flag, not `null`.
 * - **Stable order.** `entries` follow Character order, not completion order.
 *   `skipped` lists no-scope Characters first, then failed ones, each in order.
 * - **Concurrency cap** (`ESI_FANOUT_CONCURRENCY`).
 *
 * Omit `scope` only where the player explicitly asked for those Characters
 * (an explicit picker), so a 403 is the answer they wanted, not a surprise.
 */
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
  /** ESI scope every fetched Character must have granted. Omit for no pre-check. */
  scope?: string;
  /** Restrict to these Characters; default every stored Character. */
  characters?: readonly FanOutCharacter[];
  /** One Character's read. `null` or a throw means skipped. */
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

  // Slotted by index, not push-on-completion, so order never depends on which
  // fetch lands first.
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
