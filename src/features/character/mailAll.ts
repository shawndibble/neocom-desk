import { requiredScopesForEndpoints } from '@/esi/registry';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadMailOwner, loadMailOwnerCacheOnly, type MailOwnerLoad } from './mail';
import { MINUTE_MS } from '@/lib/age';
import { loadGrantedScopes } from '@/app/grantedScopes';

export const MAIL_REFRESH_MIN_GAP_MS = MINUTE_MS;

const lastLiveAt = new Map<number, number>();

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
    const held = await loadGrantedScopes(characterId);
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
  return {
    owners: characters.flatMap((c) => owners.get(c.characterId) ?? []),
    skipped: characters.flatMap((c) => skipped.get(c.characterId) ?? []),
  };
}
