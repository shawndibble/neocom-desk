import { postUniverseIds } from '@/esi/endpoints';
import { resolvePayeeName, type PayeeEntityMatch } from './payeeEntitySearch';
import type { PayeeEntityKind } from './payees';

export const NEW_PAYEE_KINDS: readonly PayeeEntityKind[] = ['corporation', 'character'];

export type PayeeNameLookup =
  | { status: 'found'; match: PayeeEntityMatch }
  | { status: 'none' }
  | { status: 'several'; matches: PayeeEntityMatch[] }
  | { status: 'failed' };

function classify(matches: readonly PayeeEntityMatch[]): PayeeNameLookup {
  const payable = matches.filter((m) => NEW_PAYEE_KINDS.includes(m.kind));
  if (payable.length === 0) return { status: 'none' };
  if (payable.length === 1) return { status: 'found', match: payable[0] };
  return { status: 'several', matches: payable };
}

export async function lookupPayeeName(name: string): Promise<PayeeNameLookup> {
  try {
    return classify(await resolvePayeeName(name));
  } catch {
    return { status: 'failed' };
  }
}

export function payeeNameKey(name: string): string {
  return name.trim().toLowerCase();
}

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
