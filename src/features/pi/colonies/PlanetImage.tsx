import { TypeIcon } from '@/components/ui';
import type { PlanetType } from '@/esi/endpoints';
import { PLANET_TYPE_ID } from './coloniesFormat';

/** A planet's render, round, as the colony's picture. Decorative: the name beside it says what it is. */
export function PlanetImage({ type, size = 40 }: { type: PlanetType; size?: number }) {
  return (
    <TypeIcon
      typeId={PLANET_TYPE_ID[type]}
      size={64}
      width={size}
      height={size}
      className="shrink-0 rounded-full"
    />
  );
}
