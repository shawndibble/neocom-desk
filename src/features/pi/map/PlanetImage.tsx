import type { PlanetType } from '@/engine/pi/goalTypes';
import { cx } from '@/lib/cx';
import { typeIconUrl } from '@/lib/eveImages';

/** The in-game planet-type icon's type id, per planet type. */
const PLANET_ICON_TYPE_ID: Record<PlanetType, number> = {
  temperate: 11,
  ice: 12,
  gas: 13,
  oceanic: 2014,
  lava: 2015,
  barren: 2016,
  storm: 2017,
  plasma: 2063,
};

/** A planet type's image: decorative, always next to its name. */
export function PlanetImage({
  type,
  size,
  className,
}: {
  type: PlanetType;
  size: number;
  className?: string;
}) {
  return (
    <img
      src={typeIconUrl(PLANET_ICON_TYPE_ID[type], 64)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      className={cx('shrink-0 rounded-full', className)}
    />
  );
}
