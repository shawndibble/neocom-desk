/**
 * The Survey's hand-off to the Moon Mining Tax tab: the Payee the creator
 * named (a corp or a person) at the rate they set. A Payee that already exists
 * under that name (any case) is reused and takes the new rate as its default,
 * since Assignments keep the rate they were made at; otherwise it is created,
 * linked to the one EVE corporation or character of that name — or, with none
 * or several, or no answer from ESI, not created at all (`PayeeNotInEveError`):
 * a Payee is always someone in game. The Tax tab's own Payee filter
 * (`tax.payee`) then opens on it.
 */
import type { PayeeRecord } from '@/db';
import { lookupPayeeName } from '@/features/miningTax/payeeLookup';
import { createPayee, loadPayees, updatePayee } from '@/features/miningTax/payees';

/** Why a typed name made no Payee: nobody in EVE has it, several do, or ESI didn't answer. */
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

/** Payee names match ignoring case and surrounding spaces. */
export function samePayeeName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The name and rate as typed in the Survey's moon tax row, before they are checked. */
export interface TaxDraft {
  name: string;
  pct: string;
}

/** What a survey already stored, as the draft that shows it. */
export function initialTaxDraft(published?: { name: string; pct: number } | null): TaxDraft {
  return { name: published?.name ?? '', pct: published ? String(published.pct) : '' };
}

/** A tax percent as typed, or null when it isn't a number from 0 to 100. */
export function parseTaxPct(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value <= 100 ? value : null;
}

/**
 * The Character's Payee for `name`: one of that name (any case), else a new
 * one at `taxPct`, linked to the EVE corporation or character of that name
 * (and named as EVE spells it, so the Survey's name still finds it). Throws `PayeeNotInEveError` rather than create
 * a Payee nobody in EVE answers to.
 */
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
  const payee = await createPayee(characterId, {
    name: match.name,
    defaultTaxPct: taxPct,
    entityId: match.id,
    entityKind: match.kind,
  });
  return { payee, created: true };
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

/** The Tax tab, unfiltered: a filter would hide every row until the Payee has an Assignment. */
export const MINING_TAX_HREF = '/mining/tax';
