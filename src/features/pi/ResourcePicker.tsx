/**
 * "Which of these would you pull here?" — the control that replaced the
 * drag-to-rank list (issue #425's ranker).
 *
 * ## Why ranking became picking
 *
 * The ranker asked a pilot to order a planet's P0s richest-first, and the only
 * thing that order ever decided was one estimated ISK-per-hour figure for a
 * single extractor. It was work with almost no payoff, and it showed: the
 * control read as something that ought to matter and then visibly didn't.
 *
 * A pick decides much more. `unbuiltPlanModel` feeds the ticked set to
 * `recommendStopTier` as the candidate `localResources`, so what a pilot
 * selects is exactly the set of chains the Advisor will size a colony around —
 * tick a second resource and a P2 that needs both becomes reachable.
 *
 * Toggle chips rather than a sortable list: the question is membership, the
 * set is four or five items, and a chip row is one tap per answer instead of a
 * drag. It is also keyboard-operable for free, which the drag list needed a
 * sensor to achieve — and `FilterChip` is that pill already, `aria-pressed`
 * and the shared control scale's touch tier included, so this composes it
 * rather than rebuilding it at a hand-written height.
 */
import { useTranslation } from 'react-i18next';
import { Button, FilterChip } from '@/components/ui';

export interface ResourcePickerProps {
  /** Every P0 this planet type yields, in payload order. */
  localResources: readonly number[];
  /** What the pilot has ticked, in the order they ticked it. */
  picked: readonly number[];
  resourceName: (typeId: number) => string;
  onChange: (picked: number[]) => void;
}

/**
 * The chip row. Ticking appends rather than inserting in payload order, so the
 * order a pilot picks in is the order the set is stored in — which keeps the
 * control's own history readable when they come back to it.
 */
export function ResourcePicker({
  localResources,
  picked,
  resourceName,
  onChange,
}: ResourcePickerProps) {
  const { t } = useTranslation();
  const chosen = new Set(picked);

  return (
    <div
      role="group"
      aria-label={t('piAdvisor.pickLabel')}
      className="flex flex-wrap items-center gap-1"
    >
      {localResources.map((typeId) => (
        <FilterChip
          key={typeId}
          label={resourceName(typeId)}
          selected={chosen.has(typeId)}
          onToggle={() =>
            onChange(
              chosen.has(typeId) ? picked.filter((id) => id !== typeId) : [...picked, typeId]
            )
          }
        />
      ))}
      {picked.length > 0 && (
        <Button variant="ghost" size="sm" onClick={() => onChange([])}>
          {t('piAdvisor.clearPicks')}
        </Button>
      )}
    </div>
  );
}
