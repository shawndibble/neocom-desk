/**
 * An ISIS hull tile: the grayscale render, the tech corner (always shown),
 * the winged Mastery badge, and the tile's tone — dim when the pilot can't
 * fly it, gold at Mastery V only. `thumb` is the ladder's 44px version with
 * the same marks.
 */
import { memo, type FocusEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { romanLevel } from '@/engine/projection';
import { tileTone } from '@/engine/shipTree/rules';
import type { ShipTreeHullStatus } from '@/engine/shipTree/types';
import { cx } from '@/lib/cx';
import { typeRenderUrl } from '@/lib/eveImages';
import type { ShipTreeShip } from '@/sde/types';
import { flyLabel } from './flyLabel';
import { techMark } from './shipTreeModel';

const TECH_TEXT = { t2: 'II', t3: 'III', faction: '◇' } as const;

function Wing({ flip }: { flip?: boolean }) {
  return (
    <svg
      width="14"
      height="12"
      viewBox="0 0 14 12"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M14 2 H3 L1 3 H14 Z M14 5 H4 L2 6 H14 Z M14 8 H6 L4 9 H14 Z" />
    </svg>
  );
}

/**
 * The winged Mastery badge: empty ring below Mastery I. Classes default to
 * the tile corner's; the Ship Info header passes its own.
 */
export function MasteryBadge({
  mastery,
  className = 'isis-badge',
  ringClassName = 'ring',
}: {
  mastery: number;
  className?: string;
  ringClassName?: string;
}) {
  return (
    <span className={className} aria-hidden="true">
      <Wing />
      <span className={ringClassName}>{mastery ? romanLevel(mastery) : ''}</span>
      <Wing flip />
    </span>
  );
}

/** The tile's inner marks, shared by the map tile and the ladder thumbnail. */
function TileMarks({ ship, mastery }: { ship: ShipTreeShip; mastery: number }) {
  const mark = techMark(ship);
  return (
    <>
      <img
        src={typeRenderUrl(ship.typeID, 128)}
        crossOrigin="anonymous"
        alt=""
        draggable={false}
        loading="lazy"
      />
      {mark && (
        <span className={cx('isis-tech', mark)} data-tech={mark} aria-hidden="true">
          {TECH_TEXT[mark]}
        </span>
      )}
      <MasteryBadge mastery={mastery} />
    </>
  );
}

export const IsisTile = memo(function IsisTile({
  ship,
  status,
  selected,
  showName,
  onSelect,
  onHover,
}: {
  ship: ShipTreeShip;
  status: ShipTreeHullStatus | undefined;
  selected: boolean;
  showName: boolean;
  onSelect: (ship: ShipTreeShip) => void;
  onHover: (ship: ShipTreeShip | null, el?: HTMLElement) => void;
}) {
  const { t } = useTranslation();
  const tone = tileTone(status);
  const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>) =>
    onHover(ship, e.currentTarget);
  return (
    <button
      type="button"
      data-ship={ship.typeID}
      data-tone={tone}
      onClick={() => onSelect(ship)}
      onMouseEnter={show}
      onMouseLeave={() => onHover(null)}
      onFocus={show}
      onBlur={() => onHover(null)}
      aria-label={
        status
          ? t('ships.tree.tileLabel', { name: ship.name, status: flyLabel(t, status) })
          : ship.name
      }
      className={cx('isis-tile', tone, selected && 'selected')}
    >
      <TileMarks ship={ship} mastery={status?.mastery ?? 0} />
      {showName && <span className="isis-name">{ship.name}</span>}
    </button>
  );
});

/** The ladder's 44px thumbnail: decorative, the row around it carries the name. */
export function IsisThumb({
  ship,
  status,
}: {
  ship: ShipTreeShip;
  status: ShipTreeHullStatus | undefined;
}) {
  const tone = tileTone(status);
  return (
    <span className={cx('isis-tile isis-thumb', tone)} data-tone={tone} aria-hidden="true">
      <TileMarks ship={ship} mastery={status?.mastery ?? 0} />
    </span>
  );
}
