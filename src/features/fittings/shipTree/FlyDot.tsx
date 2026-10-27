import { tileTone } from '@/engine/shipTree/rules';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';

/**
 * A search result's state at a glance, by shape as well as fill: hollow ring
 * can't fly, filled dot can fly, gold star Mastery V. Gold and white are only
 * ~1.4:1 apart, so the star carries the Mastery V meaning, not the colour.
 */
export function FlyDot({ status }: { status: ShipTreeHullStatus | undefined }) {
  const tone = tileTone(status);
  if (tone === 'elite') {
    return (
      <svg
        aria-hidden="true"
        data-shape="star"
        viewBox="0 0 10 10"
        className="h-2.5 w-2.5 shrink-0 fill-mastery-elite"
      >
        <path d="M5 0.4 6.35 3.5 9.7 3.8 7.15 6 7.95 9.3 5 7.55 2.05 9.3 2.85 6 0.3 3.8 3.65 3.5Z" />
      </svg>
    );
  }
  return (
    <span
      aria-hidden="true"
      data-shape={tone === 'canFly' ? 'dot' : 'ring'}
      className={cx(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        tone === 'locked' ? 'border border-text-faint' : 'bg-text'
      )}
    />
  );
}
