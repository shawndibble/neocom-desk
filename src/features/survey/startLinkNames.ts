import { postUniverseNames } from '@/esi/endpoints';
import { resolvePayeeName } from '@/features/miningTax/payeeEntitySearch';
import type { PayeeEntityKind } from '@/features/miningTax/payees';
import type { InfoFields } from '@/engine/survey/infoTemplate';
import type { StartLinkFields } from './startLink';

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

export async function nameIds(fields: StartLinkFields, info: InfoFields): Promise<InfoFields> {
  let { location, tax } = info;
  const placeId = fields.place?.id ?? null;
  if (location === null && placeId !== null) {
    const found = await resolvePlaceId(placeId).catch(() => null);
    if (found?.ok) location = { id: placeId, name: found.name };
  }
  const payeeId = fields.payee?.id ?? null;
  if (tax === null && payeeId !== null && fields.rate !== null) {
    const found = await resolvePayeeId(payeeId).catch(() => null);
    if (found?.ok) tax = { name: found.name, pct: fields.rate };
  }
  return { ...info, location, tax };
}
