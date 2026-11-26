import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import { loadPublicBpcContracts, type PublicBpcContractsSnapshot } from './syncedContracts';

export function bpcOfferRows(
  snapshot: Pick<PublicBpcContractsSnapshot, 'rows' | 'originals'>
): readonly BpcContractRow[] {
  const { rows, originals } = snapshot;
  return originals?.length ? [...rows, ...originals] : rows;
}

export async function loadBpcOfferRows(): Promise<readonly BpcContractRow[] | null> {
  try {
    const cached = await loadPublicBpcContracts();
    return cached ? bpcOfferRows(cached.data) : null;
  } catch {
    return null;
  }
}
