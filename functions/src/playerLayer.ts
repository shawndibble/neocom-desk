import type { CallableRequest } from 'firebase-functions/v2/https';
import { callerFromAuth, fail, signedInCharacter, verifyAccessToken } from './actorAuth.js';
import type { Caller } from './actorAuth.js';
import { uidForCharacter, type EveTokenClaims } from './verifyEveToken.js';

export const MAX_CLAIM_TOKENS = 10;

export interface PlayerDoc {
  id: string;
  characterIds: number[];
  uids: string[];
  updatedAt: string;
}

export interface PlayerCharacterDoc {
  characterId: number;
  playerId: string;
  ownerHash: string;
  provenAt: string;
}

export interface PlayerTx {
  getLinks(characterIds: number[]): Promise<Map<number, PlayerCharacterDoc>>;
  getPlayers(playerIds: string[]): Promise<Map<string, PlayerDoc>>;
  setLink(doc: PlayerCharacterDoc): void;
  deleteLink(characterId: number): void;
  setPlayer(doc: PlayerDoc): void;
  deletePlayer(playerId: string): void;
}

export interface PlayerLayerStore {
  transact<T>(fn: (tx: PlayerTx) => Promise<T>): Promise<T>;
}

export interface PlayerLayerDeps {
  store: PlayerLayerStore;
  verify: (accessToken: string) => Promise<EveTokenClaims>;
  now: () => number;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export interface ClaimPlayerCharactersResult {
  playerId: string;
  characterIds: number[];
  dropped: number[];
}

const byId = (a: number, b: number): number => a - b;

function playerDoc(characterIds: number[], id: string, now: number): PlayerDoc {
  const sorted = [...new Set(characterIds)].sort(byId);
  return {
    id,
    characterIds: sorted,
    uids: sorted.map(uidForCharacter),
    updatedAt: new Date(now).toISOString(),
  };
}

export async function claimPlayerCharacters(
  deps: PlayerLayerDeps,
  caller: Caller,
  accessTokens: unknown
): Promise<ClaimPlayerCharactersResult> {
  const callerId = signedInCharacter(caller);
  if (
    !Array.isArray(accessTokens) ||
    accessTokens.length < 1 ||
    accessTokens.length > MAX_CLAIM_TOKENS ||
    !accessTokens.every((t) => typeof t === 'string' && t.length > 0)
  ) {
    fail(
      'invalid-argument',
      `accessTokens must be 1 to ${MAX_CLAIM_TOKENS} strings`,
      'bad-claim-tokens'
    );
  }

  const proven = new Map<number, string>();
  for (const token of accessTokens as string[]) {
    const claims = await verifyAccessToken(deps.verify, token, {
      onReject: (err) =>
        deps.log?.('Player claim token rejected', {
          error: err instanceof Error ? err.name : 'unknown',
        }),
    });
    const seen = proven.get(claims.characterId);
    if (seen !== undefined && seen !== claims.ownerHash) {
      fail('invalid-argument', 'Conflicting tokens for one Character', 'bad-claim-tokens');
    }
    proven.set(claims.characterId, claims.ownerHash);
  }
  if (proven.get(callerId) !== caller.ownerHash) {
    fail('permission-denied', 'The tokens must include the signed-in Character', 'token-mismatch');
  }

  const now = deps.now();
  const nowIso = new Date(now).toISOString();
  const claimedIds = [...proven.keys()].sort(byId);

  return deps.store.transact(async (tx) => {
    const links = await tx.getLinks(claimedIds);
    const dropped = claimedIds.filter((id) => {
      const link = links.get(id);
      return link !== undefined && link.ownerHash !== proven.get(id);
    });
    const droppedSet = new Set(dropped);
    const touchedPlayerIds = [...new Set([...links.values()].map((l) => l.playerId))];
    const players = await tx.getPlayers(touchedPlayerIds);

    const members = new Map<string, Set<number>>();
    for (const [pid, p] of players) members.set(pid, new Set(p.characterIds));
    const dirty = new Set<string>();

    for (const id of dropped) {
      const pid = links.get(id)!.playerId;
      members.get(pid)?.delete(id);
      dirty.add(pid);
      tx.deleteLink(id);
    }

    const kept = claimedIds.filter((id) => !droppedSet.has(id));
    const keptSet = new Set(kept);
    const wholePlayer = (pid: string): boolean =>
      [...(members.get(pid) ?? [])].every((m) => keptSet.has(m));
    const mergeable = kept.filter((id) => {
      const link = links.get(id);
      return link === undefined || droppedSet.has(id) || wholePlayer(link.playerId);
    });

    const finalPlayerOf = new Map<number, string>();
    for (const id of kept) {
      const link = links.get(id);
      if (link && !wholePlayer(link.playerId)) finalPlayerOf.set(id, link.playerId);
    }

    if (mergeable.length > 0) {
      const existing = [
        ...new Set(
          mergeable.flatMap((id) => {
            const link = links.get(id);
            return link ? [link.playerId] : [];
          })
        ),
      ].sort((a, b) => Number(a) - Number(b));
      const target = existing[0] ?? String(Math.min(...mergeable));
      const next = new Set<number>(mergeable);
      for (const pid of existing) for (const m of members.get(pid) ?? []) next.add(m);
      for (const pid of existing.slice(1)) {
        members.delete(pid);
        tx.deletePlayer(pid);
        dirty.delete(pid);
      }
      members.set(target, next);
      dirty.add(target);
      for (const id of mergeable) {
        finalPlayerOf.set(id, target);
        const link = links.get(id);
        if (!link || link.playerId !== target) {
          tx.setLink({
            characterId: id,
            playerId: target,
            ownerHash: proven.get(id)!,
            provenAt: link?.provenAt ?? nowIso,
          });
        }
      }
      for (const m of next) {
        const link = links.get(m);
        if (link && !mergeable.includes(m) && link.playerId !== target) {
          tx.setLink({ ...link, playerId: target });
        }
      }
    }

    for (const pid of dirty) {
      const set = members.get(pid);
      if (!set || set.size === 0) {
        if (players.has(pid)) tx.deletePlayer(pid);
        continue;
      }
      const before = players.get(pid);
      const after = playerDoc([...set], pid, now);
      const changed = !before || before.characterIds.join(',') !== after.characterIds.join(',');
      if (changed) tx.setPlayer(after);
    }
    for (const [pid, set] of members) {
      if (set.size === 0 && !dirty.has(pid) && players.has(pid)) tx.deletePlayer(pid);
    }

    const callerPlayer = finalPlayerOf.get(callerId);
    const ids = callerPlayer ? [...(members.get(callerPlayer) ?? [])].sort(byId) : [];
    return { playerId: callerPlayer ?? '', characterIds: ids, dropped };
  });
}

export function claimPlayerCharactersHandler(deps: PlayerLayerDeps) {
  return async (request: CallableRequest<unknown>): Promise<ClaimPlayerCharactersResult> => {
    const caller = callerFromAuth(request.auth);
    const data = request.data;
    const accessTokens =
      typeof data === 'object' && data !== null
        ? (data as { accessTokens?: unknown }).accessTokens
        : undefined;
    return claimPlayerCharacters(deps, caller, accessTokens);
  };
}
