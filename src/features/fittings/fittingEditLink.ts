import { encodeFittingShare } from '@/engine/fittings/fittingShare';
import { fittingToShareInput } from '@/engine/fittings/shareMapper';
import type { Fitting } from '@/engine/fittings/types';
import { fittingEditLocation, type FittingEditLocation } from './fittingRoutes';

export async function fittingEditLocationFor(
  fitting: Fitting
): Promise<FittingEditLocation | null> {
  const encoded = await encodeFittingShare(fittingToShareInput(fitting)).catch(() => null);
  return encoded?.ok ? fittingEditLocation(encoded.payload) : null;
}
