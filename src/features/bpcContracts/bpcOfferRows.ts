/**
 * The Public Contract Offers snapshot's blueprint rows as one list: copies,
 * then originals (`runs: -1`, issue #1240). Every consumer that wants "all the
 * contract offers for a blueprint" reads through here instead of re-deriving
 * the concat and its failure handling. ADR 0013's cache seam is untouched:
 * this sits on top of `loadPublicBpcContracts`.
 */
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import { loadPublicBpcContracts, type PublicBpcContractsSnapshot } from './syncedContracts';

/**
 * Copies then originals; a snapshot cached before originals existed has none.
 * With no originals the snapshot's own `rows` array comes back (no copy), so
 * a consumer keyed on its identity is not re-triggered.
 */
export function bpcOfferRows(
  snapshot: Pick<PublicBpcContractsSnapshot, 'rows' | 'originals'>
): readonly BpcContractRow[] {
  const { rows, originals } = snapshot;
  return originals?.length ? [...rows, ...originals] : rows;
}

/**
 * Every offer row right now, or null when the snapshot is missing (sync off,
 * not landed yet) or the load failed. Callers pick their own fallback for null.
 */
export async function loadBpcOfferRows(
  characterId: number
): Promise<readonly BpcContractRow[] | null> {
  try {
    const cached = await loadPublicBpcContracts(characterId);
    return cached ? bpcOfferRows(cached.data) : null;
  } catch {
    return null;
  }
}
