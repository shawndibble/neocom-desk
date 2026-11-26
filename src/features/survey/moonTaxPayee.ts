import type { PayeeRecord } from '@/db';
import { lookupPayeeName } from '@/features/miningTax/payeeLookup';
import { createPayeeOnce, loadPayees, updatePayee } from '@/features/miningTax/payees';

export class PayeeNotInEveError extends Error {
  constructor(
    readonly payeeName: string,
    readonly reason: 'none' | 'several' | 'failed'
  ) {
    super(`No single EVE corporation or character named ${payeeName} (${reason})`);
    this.name = 'PayeeNotInEveError';
  }
}

export function findPayeeByName(
  payees: readonly PayeeRecord[],
  name: string
): PayeeRecord | undefined {
  return payees.find((p) => samePayeeName(p.name, name));
}

export function samePayeeName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export interface TaxDraft {
  name: string;
  pct: string;
}

export function initialTaxDraft(published?: { name: string; pct: number } | null): TaxDraft {
  return { name: published?.name ?? '', pct: published ? String(published.pct) : '' };
}

export function parseTaxPct(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= 100 ? value : null;
}

export async function findOrCreatePayee(
  characterId: number,
  name: string,
  taxPct: number
): Promise<{ payee: PayeeRecord; created: boolean }> {
  const payees = await loadPayees(characterId);
  const byName = findPayeeByName(payees, name);
  if (byName) return { payee: byName, created: false };
  const trimmed = name.trim();
  const lookup = await lookupPayeeName(trimmed);
  if (lookup.status !== 'found') throw new PayeeNotInEveError(trimmed, lookup.status);
  const { match } = lookup;
  return createPayeeOnce(
    characterId,
    { name: match.name, defaultTaxPct: taxPct, entityId: match.id, entityKind: match.kind },
    (stored) => findPayeeByName(stored, name) ?? findPayeeByName(stored, match.name)
  );
}

export async function ensurePayee(
  characterId: number,
  name: string,
  taxPct: number
): Promise<PayeeRecord> {
  const { payee: existing, created } = await findOrCreatePayee(characterId, name, taxPct);
  if (created || existing.defaultTaxPct === taxPct) return existing;
  return updatePayee(existing, {
    name: existing.name,
    defaultTaxPct: taxPct,
    hubId: existing.hubId,
  });
}

export const MINING_TAX_HREF = '/mining/tax';
