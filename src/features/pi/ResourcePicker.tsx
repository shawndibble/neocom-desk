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
 * tick a second resource and a P2 that needs both becomes reachable. The
 * ordering survives as click order, which still breaks ties for
 * `estimateUnbuiltPlanet`, so nothing that depended on rank lost its input.
 *
 * Toggle chips rather than a sortable list: the question is membership, the
 * set is four or five items, and a chip row is one tap per answer instead of a
 * drag. It is also keyboard-operable for free, which the drag list needed a
 * sensor to achieve.
 */
import { useTranslation } from 'react-i18next';

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
 * first thing a pilot picks stays their first preference — which is what
 * `estimateUnbuiltPlanet` reads when it has to choose one.
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
      {localResources.map((typeId) => {
        const on = chosen.has(typeId);
        return (
          <button
            key={typeId}
            type="button"
            aria-pressed={on}
            onClick={() =>
              onChange(on ? picked.filter((id) => id !== typeId) : [...picked, typeId])
            }
            className={`inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-xs border px-2 text-[0.6875rem] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
              on
                ? 'border-accent-dim bg-accent/10 text-text'
                : 'border-line bg-panel-2 text-text-dim hover:border-line-bright hover:text-text'
            }`}
          >
            {/* The tick is the state, so it only renders when the chip is on —
                an always-present outline box would read as a checkbox that is
                never checked at this size. */}
            {on && (
              <svg
                aria-hidden="true"
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-accent"
              >
                <path d="M3 8.5l3.2 3.2L13 5" />
              </svg>
            )}
            {resourceName(typeId)}
          </button>
        );
      })}
      {picked.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="h-6 cursor-pointer px-1.5 text-[0.6875rem] text-text-faint hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
        >
          {t('piAdvisor.clearPicks')}
        </button>
      )}
    </div>
  );
}
