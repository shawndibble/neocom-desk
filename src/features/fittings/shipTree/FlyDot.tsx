import { tileTone } from '@/engine/shipTree/rules';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';

/** A search result's tone at a glance: gold Mastery V, bright can fly, faint can't. */
export function FlyDot({ status }: { status: ShipTreeHullStatus | undefined }) {
  const tone = tileTone(status);
  return (
    <span
      aria-hidden="true"
      className={cx(
        'inline-block h-2 w-2 shrink-0 rounded-full',
        tone === 'locked' && 'bg-text-faint',
        tone === 'canFly' && 'bg-text',
        tone === 'elite' && 'bg-[#e8b84a]'
      )}
    />
  );
}
