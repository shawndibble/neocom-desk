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
      className="pointer-events-none fixed z-50 border border-[#3d525e] bg-[#05090c]/95 p-3 text-xs text-[#c9d6dc] shadow-xl shadow-black/60"
      style={{
        width: WIDTH,
        left,
        ...(above ? { bottom: window.innerHeight - anchor.top + 8 } : { top: anchor.bottom + 8 }),
      }}
    >
      <div className="flex gap-3">
        <img
          src={typeRenderUrl(ship.typeID, 128)}
          alt=""
          className="h-20 w-20 shrink-0 border border-[#2a3a44] object-cover"
        />
        <div className="min-w-0">
          <div className="text-base text-white">{ship.name}</div>
          <div className="text-[#8aa0ab]">{className}</div>
        </div>
      </div>
      <div className="mt-2">
        <TraitList traits={ship.traits} skillName={skillName} tone="isis" />
      </div>
      <div className="mt-2 text-[#6f808b]">{t('ships.tree.hoverHint')}</div>
    </div>
  );
}
