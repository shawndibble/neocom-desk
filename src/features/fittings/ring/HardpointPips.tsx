import { hardpointLabel } from './ringFormat';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import {
  RING_GAUGE_RADIUS,
  RING_VIEW,
  arcPath,
  hardpointGlyphAngle,
  hardpointPipAngles,
  ringPoint,
} from '@/engine/fittings/ringLayout';
import type { HardpointKind } from '@/engine/fittings/hardpoints';

/** A pip's radius, and the band a pointer hovers to read a kind's numbers. */
const PIP_RADIUS = 5;
const PIP_HIT_WIDTH = 22;
/** The hardpoint icon's side, ring units: a little wider than a pip. */
const GLYPH_SIZE = 18;

/**
 * CCP's own fitting-window hardpoint icons (the EVE University wiki's
 * `Icon_turret_hp.png` / `Icon_launcher_hp.png`), as the Add panel's slot
 * icons are (DESIGN.md §5's exception): a split hull's two rows of pips read
 * as the client draws them, not as two anonymous runs of dots.
 */
const HARDPOINT_ICON: Readonly<Record<HardpointKind, string>> = {
  turret: '/images/fitting/hardpoint-turret.png',
  launcher: '/images/fitting/hardpoint-launcher.png',
};

/**
 * One kind of hardpoint on the rim's top gap: its icon by 12 o'clock, then a
 * pip each, filled where the high slots take one, red past what the hull has.
 */
export function HardpointPips({
  kind,
  total,
  used,
  compact,
}: {
  kind: HardpointKind;
  total: number;
  /** Null until every high-slot type is known: then nothing shows as taken. */
  used: number | null;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const taken = used ?? 0;
  const angles = hardpointPipAngles(kind, Math.max(total, taken));
  if (angles.length === 0) return null;
  const c = RING_VIEW / 2;
  const glyphAngle = hardpointGlyphAngle(kind);
  const g = ringPoint(glyphAngle, RING_GAUGE_RADIUS);
  const glyph = (
    <image
      href={HARDPOINT_ICON[kind]}
      x={c + g.x - GLYPH_SIZE / 2}
      y={c + g.y - GLYPH_SIZE / 2}
      width={GLYPH_SIZE}
      height={GLYPH_SIZE}
    />
  );
  const pips = angles.map((angle, index) => {
    const p = ringPoint(angle, RING_GAUGE_RADIUS);
    const fill =
      index >= total
        ? 'fill-danger stroke-danger'
        : index < taken
          ? 'fill-accent stroke-accent'
          : 'fill-bg stroke-line-bright';
    return (
      <circle
        key={index}
        cx={c + p.x}
        cy={c + p.y}
        r={PIP_RADIUS}
        className={fill}
        strokeWidth={1.5}
      />
    );
  });
  if (compact)
    return (
      <g data-hardpoints={kind}>
        {glyph}
        {pips}
      </g>
    );
  const ends = [glyphAngle, angles[0], angles[angles.length - 1]];
  return (
    <Tooltip content={hardpointLabel(t, kind, used, total)}>
      <g data-hardpoints={kind} className="pointer-events-auto">
        <path
          d={arcPath(Math.min(...ends) - 2, Math.max(...ends) + 2, RING_GAUGE_RADIUS, c, c)}
          className="fill-none stroke-transparent"
          strokeWidth={PIP_HIT_WIDTH}
        />
        {glyph}
        {pips}
      </g>
    </Tooltip>
  );
}
