/**
 * The Survey's hand-off to the Moon Mining Tax tab: the Payee the creator
 * named (a corp or a person) at the rate they set. A Payee that already exists
 * under that name (any case) is reused and takes the new rate as its default,
 * since Assignments keep the rate they were made at; otherwise it is created.
 * The Tax tab's own Payee filter (`tax.payee`) then opens on it.
 */
import type { PayeeRecord } from '@/db';
import { createPayee, loadPayees, updatePayee } from '@/features/miningTax/payees';

export function findPayeeByName(
  payees: readonly PayeeRecord[],
  name: string
): PayeeRecord | undefined {
  const wanted = name.trim().toLowerCase();
  return payees.find((p) => p.name.trim().toLowerCase() === wanted);
}

/** A tax percent as typed, or null when it isn't a number from 0 to 100. */
export function parseTaxPct(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= 100 ? value : null;
}

export async function ensurePayee(
  characterId: number,
  name: string,
  taxPct: number
): Promise<PayeeRecord> {
  const existing = findPayeeByName(await loadPayees(characterId), name);
  if (!existing) return createPayee(characterId, { name: name.trim(), defaultTaxPct: taxPct });
  if (existing.defaultTaxPct === taxPct) return existing;
  return updatePayee(existing, {
    name: existing.name,
    defaultTaxPct: taxPct,
    systemId: existing.systemId,
    hubId: existing.hubId,
  });
}

/** The Tax tab, unfiltered: a filter would hide every row until the Payee has an Assignment. */
export const MINING_TAX_HREF = '/mining/tax';
