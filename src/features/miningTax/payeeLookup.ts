/**
 * Who a Payee's name is in EVE. A Payee must be a real corporation or character
 * someone can pay (scope decision
 * `20261117-005150-a-payee-named-exactly-as-a-books-corporation.md`), so every
 * flow that makes one from a typed name asks here first and creates nothing
 * unless exactly one corporation or character answers to it. Alliances are never
 * a new Payee's kind: an alliance holds no wallet a member pays into.
 */
import { postUniverseIds } from '@/esi/endpoints';
import { resolvePayeeName, type PayeeEntityMatch } from './payeeEntitySearch';
import type { PayeeEntityKind } from './payees';

/** What a new Payee may be. */
export const NEW_PAYEE_KINDS: readonly PayeeEntityKind[] = ['corporation', 'character'];

export type PayeeNameLookup =
  | { status: 'found'; match: PayeeEntityMatch }
  /** No corporation or character has this name (a moon, a place, a typo). */
  | { status: 'none' }
  /** A corporation and a character share it: the pilot picks, never a guess. */
  | { status: 'several'; matches: PayeeEntityMatch[] }
  /** ESI could not be asked (offline, an error): unknown, not "nobody". */
  | { status: 'failed' };

function classify(matches: readonly PayeeEntityMatch[]): PayeeNameLookup {
  const payable = matches.filter((m) => NEW_PAYEE_KINDS.includes(m.kind));
  if (payable.length === 0) return { status: 'none' };
  if (payable.length === 1) return { status: 'found', match: payable[0] };
  return { status: 'several', matches: payable };
}

/** One name, as typed: ESI's exact-name match ignores case. Never rejects. */
export async function lookupPayeeName(name: string): Promise<PayeeNameLookup> {
  try {
    return classify(await resolvePayeeName(name));
  } catch {
    return { status: 'failed' };
  }
}

/** The key `lookupPayeeNames` answers a name under: ESI matches names ignoring case. */
export function payeeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Many names in one `/universe/ids` call (ESI batches it), keyed by
 * `payeeNameKey`. Rejects when ESI can't be asked, so a caller never reads a
 * failed lookup as "nobody has these names".
 */
export async function lookupPayeeNames(
  names: readonly string[]
): Promise<Map<string, PayeeNameLookup>> {
  const unique = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed !== '' && !unique.has(payeeNameKey(trimmed))) {
      unique.set(payeeNameKey(trimmed), trimmed);
    }
  }
  const answers = new Map<string, PayeeNameLookup>();
  if (unique.size === 0) return answers;
  const ids = await postUniverseIds([...unique.values()]);
  const byName = new Map<string, PayeeEntityMatch[]>();
  const buckets: [PayeeEntityKind, { id: number; name: string }[] | undefined][] = [
    ['corporation', ids.corporations],
    ['character', ids.characters],
  ];
  for (const [kind, entries] of buckets) {
    for (const entry of entries ?? []) {
      const key = payeeNameKey(entry.name);
      byName.set(key, [...(byName.get(key) ?? []), { ...entry, kind }]);
    }
  }
  for (const key of unique.keys()) answers.set(key, classify(byName.get(key) ?? []));
  return answers;
}
