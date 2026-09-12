/**
 * The refusals, as a list.
 *
 * One row per thing the Advisor declined to answer, each naming the planet it
 * is about. The sentences are the ones the cards already used — this moves
 * them, it does not reword them, so a pilot who knew what
 * `stopTierBlocked.needs-prices` meant on a card still knows here.
 */
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { BlindSpot } from './blindSpotModel';

/** Each reason renders the string the card used for it, with its own arguments. */
function sentence(spot: BlindSpot, t: TFunction): string {
  switch (spot.reason) {
    case 'detail-unavailable':
      return t('piAdvisor.detailUnavailable');
    case 'no-measured-extraction':
      return t('piAdvisor.noMeasuredExtraction');
    case 'unknown-pins':
      return t('piAdvisor.unknownPins', { count: spot.count ?? 1 });
    case 'needs-link-cost':
      return t('piAdvisor.roomUnknownRadius', { count: spot.count ?? 1 });
    default:
      return t(`piAdvisor.stopTierBlocked.${spot.reason}`);
  }
}

export function BlindSpots({ spots }: { spots: readonly BlindSpot[] }) {
  const { t } = useTranslation();

  if (spots.length === 0) {
    return <p className="text-xs text-text-dim">{t('piAdvisor.blindNone')}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.6875rem] text-text-dim">{t('piAdvisor.blindHint')}</p>
      <ul className="space-y-1.5">
        {spots.map((spot) => (
          <li key={spot.key} className="flex items-baseline gap-2.5">
            <span className="inline-flex h-[1.125rem] shrink-0 items-center rounded-xs border border-transparent bg-panel-2 px-1.5 text-[0.625rem] font-bold tracking-widest text-text-faint uppercase">
              {t('piAdvisor.blindTag')}
            </span>
            <span className="min-w-0 text-xs text-text-dim">
              <span className="text-text">
                {spot.planetName ?? t('pi.planetLabel', { id: spot.planetId })}
              </span>
              {' — '}
              {sentence(spot, t)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
