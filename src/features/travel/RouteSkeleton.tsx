/**
 * What Route Safety's route area holds before a route exists: the heading,
 * its one-line hint, and ghost rows in the shape of the itinerary that will
 * take their place. The ghosts are decoration (`aria-hidden`); the heading and
 * hint carry the message.
 *
 * DESIGN.md §6a prefers a spinner to a skeleton for something loading. This is
 * not loading: nothing is coming until a destination is picked, so it shows
 * what the page will hold. See decision "Route Safety shows an empty route as
 * ghost rows".
 */
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';

const GHOST_ROWS = [11, 8, 13, 9, 12, 7];

export function RouteSkeleton({ hint }: { hint: string }) {
  const { t } = useTranslation();
  return (
    <Panel title={t('travel.pickTitle')}>
      <p className="mb-3 text-sm text-text-dim">{hint}</p>
      <ol aria-hidden="true" className="flex flex-col opacity-60">
        {GHOST_ROWS.map((width, index) => (
          <li
            key={index}
            className="flex items-center gap-3 border-t border-line py-2 first:border-t-0"
          >
            <i className="size-3 shrink-0 rounded-full bg-line" />
            <i className="h-2.5 rounded-xs bg-panel-2" style={{ width: `${width}rem` }} />
            <i className="ml-auto h-2.5 w-8 rounded-xs bg-panel-2" />
            <i className="h-2.5 w-14 rounded-xs bg-panel-2 max-sm:hidden" />
          </li>
        ))}
      </ol>
    </Panel>
  );
}
