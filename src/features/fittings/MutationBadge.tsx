/**
 * The flag on a fitted mutated module whose stats the app can't state
 * exactly (`mutationStatus`): rolls unknown (the base module's own values
 * stand in) or base unknown (it adds nothing to the stats). DESIGN.md §6c's
 * amber warning mark — a figure leaning on something the pilot hasn't
 * confirmed — with a tooltip saying what is missing and where it is set
 * (the module menu's "Mutate…"). A module the app knows fully shows nothing.
 */
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import type { ItemMutation } from '@/engine/fittings/types';
import { useUnknownMutation, useUnknownMutationTip } from './useUnknownMutation';

/** The List row's flag after the module's name. */
export function MutationBadge({ item }: { item: { typeId: number; mutation?: ItemMutation } }) {
  const { t } = useTranslation();
  const status = useUnknownMutation(item);
  const tip = useUnknownMutationTip(status);
  if (status === null || tip === null) return null;
  return (
    <HintText
      content={tip}
      className="inline-flex shrink-0 items-center gap-1 text-[0.6875rem] font-semibold text-warning"
    >
      <Icon.Warn aria-hidden className="size-3" />
      {t(`fittings.mutation.badge.${status}`)}
    </HintText>
  );
}
