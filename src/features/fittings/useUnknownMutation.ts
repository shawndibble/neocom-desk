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

export type MutableItem = { typeId: number; mutation?: ItemMutation };

/**
 * The first flag-worthy status among `items` (a module, or one drone type's
 * units, which each roll apart), or null: nothing to flag, or the data is
 * still loading.
 */
export function useUnknownMutation(items: readonly MutableItem[]): UnknownMutationStatus | null {
  const lookup = useMutaplasmidLookup();
  if (lookup === null) return null;
  for (const item of items) {
    const status = mutationStatus(item, lookup);
    if (status === 'rollsUnknown' || status === 'baseUnknown') return status;
  }
  return null;
}

/**
 * What the flag's tooltip says: what is missing, then — in the editor, for an
 * item with a "Mutate" (`fixable`) — where to set it.
 */
export function useUnknownMutationTip(
  status: UnknownMutationStatus | null,
  fixable = true
): string | null {
  const { t } = useTranslation();
  const editable = useFittingItemActions() !== null;
  if (status === null) return null;
  const what = t(`fittings.mutation.badge.${status}Tip`);
  return editable && fixable ? `${what} ${t(`fittings.mutation.badge.${status}Fix`)}` : what;
}
