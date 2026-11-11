/**
 * Names for the IDs a start link carries, from ESI's public `POST /universe/names`
 * (no login). One ID per request, because ESI answers 404 for the whole batch if
 * any ID in it is unknown, and a link may hold one good ID and one bad. A place
 * must be a solar system or an NPC station (a structure's name needs a login), a
 * payee a corporation, alliance or character; anything else counts as not found.
 */
import { postUniverseNames } from '@/esi/endpoints';
import { resolvePayeeName } from '@/features/miningTax/payeeEntitySearch';
import type { PayeeEntityKind } from '@/features/miningTax/payees';

export type PayeeKind = PayeeEntityKind;

export type Resolved<Extra = object> = ({ ok: true; name: string } & Extra) | { ok: false };

async function nameOf(id: number, signal?: AbortSignal) {
  const names = await postUniverseNames([id], { signal }).catch(() => []);
  return names[0] ?? null;
}

export async function resolvePlaceId(id: number, signal?: AbortSignal): Promise<Resolved> {
  const found = await nameOf(id, signal);
  return found !== null && (found.category === 'solar_system' || found.category === 'station')
    ? { ok: true, name: found.name }
    : { ok: false };
}

export type ResolvedPayee = Resolved<{ kind: PayeeKind; id: number }>;

export async function resolvePayeeId(id: number, signal?: AbortSignal): Promise<ResolvedPayee> {
  const found = await nameOf(id, signal);
  return found !== null &&
    (found.category === 'corporation' ||
      found.category === 'alliance' ||
      found.category === 'character')
    ? { ok: true, name: found.name, kind: found.category, id }
    : { ok: false };
}

/**
 * The reverse: a typed payee name, checked against ESI's public exact-name lookup
 * (`resolvePayeeName`). The in-game spelling and the ID come back, so the link can
 * carry the ID. One name that is several things takes the first the Payee manager
 * lists (corporation, then character, then alliance).
 */
export async function resolveTypedPayee(
  name: string,
  signal?: AbortSignal
): Promise<ResolvedPayee> {
  try {
    const [best] = await resolvePayeeName(name, signal);
    return best ? { ok: true, name: best.name, kind: best.kind, id: best.id } : { ok: false };
  } catch {
    return { ok: false };
  }
}
