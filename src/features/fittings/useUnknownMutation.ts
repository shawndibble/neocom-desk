/**
 * Whether a fitted item gets the "rolls unknown" / "base unknown" flag
 * (`MutationBadge`, the Ring's corner flag), and what its tooltip says.
 */
import { useTranslation } from 'react-i18next';
import { mutationStatus, type MutationStatus } from '@/engine/fittings/mutaplasmids';
import type { ItemMutation } from '@/engine/fittings/types';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { useFittingItemActions } from './fittingItemActions';

/** The statuses that get a flag. */
export type UnknownMutationStatus = Extract<MutationStatus, 'rollsUnknown' | 'baseUnknown'>;

/** The item's flag-worthy status, or null (nothing to flag, or the data is still loading). */
export function useUnknownMutation(item: {
  typeId: number;
  mutation?: ItemMutation;
}): UnknownMutationStatus | null {
  const lookup = useMutaplasmidLookup();
  if (lookup === null) return null;
  const status = mutationStatus(item, lookup);
  return status === 'rollsUnknown' || status === 'baseUnknown' ? status : null;
}

/** What the flag's tooltip says: what is missing, then — in the editor — where to set it. */
export function useUnknownMutationTip(status: UnknownMutationStatus | null): string | null {
  const { t } = useTranslation();
  const editable = useFittingItemActions() !== null;
  if (status === null) return null;
  const what = t(`fittings.mutation.badge.${status}Tip`);
  return editable ? `${what} ${t('fittings.mutation.badge.fixTip')}` : what;
}
