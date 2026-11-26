import { useTranslation } from 'react-i18next';
import { mutationStatus, type MutationStatus } from '@/engine/fittings/mutaplasmids';
import type { ItemMutation } from '@/engine/fittings/types';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { useFittingItemActions } from './fittingItemActions';

export type UnknownMutationStatus = Extract<MutationStatus, 'rollsUnknown' | 'baseUnknown'>;

export type MutableItem = { typeId: number; mutation?: ItemMutation };

export function useUnknownMutation(items: readonly MutableItem[]): UnknownMutationStatus | null {
  const lookup = useMutaplasmidLookup();
  if (lookup === null) return null;
  for (const item of items) {
    const status = mutationStatus(item, lookup);
    if (status === 'rollsUnknown' || status === 'baseUnknown') return status;
  }
  return null;
}

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
