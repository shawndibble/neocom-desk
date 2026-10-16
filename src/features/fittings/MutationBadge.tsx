/**
 * The flag on a fitted mutated item whose stats the app can't state
 * exactly (`mutationStatus`): rolls unknown (the base module's own values
 * stand in) or base unknown (it adds nothing to the stats). DESIGN.md §6c's
 * amber warning mark — a figure leaning on something the pilot hasn't
 * confirmed — with a tooltip saying what is missing and where it is set
 * (the module menu's "Mutate…"). A module the app knows fully shows nothing.
 */
import { useTranslation } from 'react-i18next';
import { HintText } from '@/components/ui/HintText';
import * as Icon from '@/components/ui/icons';
import { useUnknownMutation, useUnknownMutationTip, type MutableItem } from './useUnknownMutation';

/**
 * The List row's flag after the item's name: a module, or a drone type's
 * units. Drones have no "Mutate…", so `fixable={false}` leaves the fix out of the tip.
 */
export function MutationBadge({
  items,
  fixable,
}: {
  items: readonly MutableItem[];
  fixable?: boolean;
}) {
  const { t } = useTranslation();
  const status = useUnknownMutation(items);
  const tip = useUnknownMutationTip(status, fixable);
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
