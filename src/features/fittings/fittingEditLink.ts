import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { fittingEditLocation, type FittingEditLocation } from './fittingRoutes';

/**
 * The editor's location for a Fitting held in memory, or null when it is too
 * large to carry in a link or the encode fails.
 */
export async function fittingEditLocationFor(
  fitting: Fitting
): Promise<FittingEditLocation | null> {
  const encoded = await encodeFittingShare(fittingToShareInput(fitting)).catch(() => null);
  return encoded?.ok ? fittingEditLocation(encoded.payload) : null;
}
