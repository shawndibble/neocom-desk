/**
 * The in-game hover card: render, name, class and bonuses. Fixed-position
 * against the hovered tile's screen box, outside the scaled world, so it
 * reads at 100% whatever the zoom.
 */
import { useTranslation } from 'react-i18next';
import { typeRenderUrl } from '@/lib/eveImages';
import type { ShipTreeShip } from '@/sde/types';
import { TraitList } from './TraitList';

const WIDTH = 340;

export function HoverCard({
  ship,
  anchor,
  className,
  skillName,
}: {
  ship: ShipTreeShip;
  anchor: DOMRect;
  className: string;
  skillName: (skillTypeID: number) => string;
}) {
  const { t } = useTranslation();
  const left = Math.min(
    window.innerWidth - WIDTH - 8,
    Math.max(8, anchor.left + anchor.width / 2 - WIDTH / 2)
  );
  const above = anchor.top > 320;
  return (
    <div
      role="tooltip"
      data-testid="ship-tree-hover-card"
      className="isis-hover-card pointer-events-none fixed z-50 border p-3 text-xs shadow-xl shadow-black/60"
      style={{
        width: WIDTH,
        left,
        ...(above ? { bottom: window.innerHeight - anchor.top + 8 } : { top: anchor.bottom + 8 }),
      }}
    >
      <div className="flex gap-3">
        <img
          src={typeRenderUrl(ship.typeID, 128)}
          crossOrigin="anonymous"
          alt=""
          className="isis-hover-render h-20 w-20 shrink-0 border object-cover"
        />
        <div className="min-w-0">
          <div className="isis-hover-name text-base">{ship.name}</div>
          <div className="isis-hover-class">{className}</div>
        </div>
      </div>
      <div className="mt-2">
        <TraitList traits={ship.traits} skillName={skillName} tone="isis" />
      </div>
      <div className="isis-hover-hint mt-2">{t('ships.tree.hoverHint')}</div>
    </div>
  );
}
