/**
 * The All-characters Mail load (issue #2867): every Character's headers, label
 * counts and mailing lists from the same per-Character loaders the single view
 * uses, fanned out under the shared concurrency cap.
 *
 * A Character without the mail grant is skipped (named in the scope readout);
 * so is one with nothing to show (never fetched, offline). Each Character goes
 * live no more often than {@link MAIL_REFRESH_MIN_GAP_MS}: a Refresh inside
 * that window reads Dexie instead, so mashing Refresh with four Characters
 * never means four mail fetches a second.
 */
import { db } from '@/db';
import { requiredScopesForEndpoints } from '@/esi/registry';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadMailOwner, loadMailOwnerCacheOnly, type MailOwnerLoad } from './mail';

export const MAIL_REFRESH_MIN_GAP_MS = 60_000;

const lastLiveAt = new Map<number, number>();

/** Test seam: forget when each Character last went live. */
export function resetMailRefreshThrottle(): void {
  lastLiveAt.clear();
}

export interface OwnerMail extends MailOwnerLoad {
  characterId: number;
  name: string;
}

export interface SkippedMailCharacter {
  characterId: number;
  name: string;
  /** False when the stored grant lacks the mail read scope — the case a Grant note can fix. */
  granted: boolean;
}

export interface AllMailLoad {
  owners: OwnerMail[];
  skipped: SkippedMailCharacter[];
}

const MAIL_READ_SCOPES = requiredScopesForEndpoints(['getCharacterMailHeaders']);

export async function loadMailForCharacters(
  characters: readonly { characterId: number; name: string }[],
  now: number = Date.now()
): Promise<AllMailLoad> {
  const owners = new Map<number, OwnerMail>();
  const skipped = new Map<number, SkippedMailCharacter>();
  await mapWithConcurrencyLimit(characters, ESI_FANOUT_CONCURRENCY, async (character) => {
    const { characterId, name } = character;
    const held = new Set((await db.tokens.get(characterId))?.scopes ?? []);
    if (!MAIL_READ_SCOPES.every((scope) => held.has(scope))) {
      skipped.set(characterId, { characterId, name, granted: false });
      return;
    }
    const last = lastLiveAt.get(characterId);
    const throttled = last !== undefined && now - last < MAIL_REFRESH_MIN_GAP_MS;
    if (!throttled) lastLiveAt.set(characterId, now);
    let load: MailOwnerLoad;
    try {
      load = throttled
        ? await loadMailOwnerCacheOnly(characterId)
        : await loadMailOwner(characterId);
    } catch {
      load = await loadMailOwnerCacheOnly(characterId);
    }
    if (load.headers === null) {
      skipped.set(characterId, { characterId, name, granted: !load.needsReauth });
      return;
    }
    owners.set(characterId, { characterId, name, ...load });
  });
  // Input order, not completion order: the menu and the tooltip must not reshuffle per load.
  return {
    owners: characters.flatMap((c) => owners.get(c.characterId) ?? []),
    skipped: characters.flatMap((c) => skipped.get(c.characterId) ?? []),
  };
}
