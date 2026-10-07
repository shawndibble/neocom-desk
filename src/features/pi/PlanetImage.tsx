import type { ReactNode } from 'react';
import { TypeIcon } from '@/components/ui';
import type { PlanetType } from '@/engine/pi/goalTypes';
import { cx } from '@/lib/cx';
import { PLANET_TYPE_ICON_ID } from './planetTypeIcons';

/**
 * A planet-type image, round. Decorative: the planet's name and type sit in
 * text beside it. `badge` is a small glyph over the corner (a quick win's action).
 */
export function PlanetImage({
  type,
  size = 40,
  badge,
  className,
}: {
  type: PlanetType;
  size?: number;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx('relative inline-flex shrink-0 rounded-full', className)}
      style={{ width: size, height: size }}
    >
      <TypeIcon
        typeId={PLANET_TYPE_ICON_ID[type]}
        size={64}
        width={size}
        height={size}
        className="rounded-full"
      />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -bottom-0.5 inline-flex size-4 items-center justify-center rounded-full border border-line bg-panel text-text-dim"
        >
          {badge}
        </span>
      )}
    </span>
  );
}
