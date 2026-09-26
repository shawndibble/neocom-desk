/**
 * The map's SVG layer: the pirate classes' thin links to their parent
 * empires, every class connector (unlit first, lit pipes over them), the
 * gold Ω hexagons, and the capsule root. The layout is already in world
 * coordinates, so everything is drawn as given.
 */
import type { ShipTreeEdge, ShipTreeLayout } from '@/engine/shipTree/types';
import { CAPSULE_ICON_URL } from './shipTreeAssets';

function Pipe({ d, lit }: { d: string; lit: boolean }) {
  return lit ? (
    <g data-lit="true">
      <path d={d} fill="none" stroke="#9fc3d3" strokeOpacity={0.25} strokeWidth={10} />
      <path d={d} fill="none" stroke="#c6dde6" strokeWidth={6} />
      <path d={d} fill="none" stroke="#56707c" strokeWidth={2.4} />
    </g>
  ) : (
    <g data-lit="false">
      <path d={d} fill="none" stroke="#3b4b55" strokeWidth={4} />
      <path d={d} fill="none" stroke="#070d12" strokeWidth={2} />
    </g>
  );
}

export function MapLines({
  layout,
  lit,
}: {
  layout: ShipTreeLayout;
  lit: (edge: ShipTreeEdge) => boolean;
}) {
  const { edges, emblems, omegas, root, width, height } = layout;
  return (
    <svg
      width={width}
      height={height}
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
    >
      {emblems.map((e, i) => {
        const d = `M ${e.from.x} ${e.from.y} V ${e.y}`;
        return (
          <g key={`em${i}`}>
            <path d={d} fill="none" stroke="#3b4b55" strokeWidth={4} />
            <path d={d} fill="none" stroke="#070d12" strokeWidth={2} />
          </g>
        );
      })}
      {edges
        .filter((e) => !lit(e))
        .map((e) => (
          <Pipe key={e.key} d={e.d} lit={false} />
        ))}
      {edges.filter(lit).map((e) => (
        <Pipe key={e.key} d={e.d} lit />
      ))}
      {omegas.map((o, i) => (
        <g key={`o${i}`} transform={`translate(${o.x} ${o.y})`} data-omega="true">
          <polygon
            points="-8,-14 8,-14 16,0 8,14 -8,14 -16,0"
            fill="#15130b"
            stroke="#7a6120"
            strokeWidth={1.5}
          />
          <text
            y={5}
            textAnchor="middle"
            fontSize={15}
            fontWeight={700}
            fill="#d9a72c"
            fontFamily="serif"
          >
            Ω
          </text>
        </g>
      ))}
      <image href={CAPSULE_ICON_URL} x={root.x - 2} y={root.y - 16} width={32} height={32} />
    </svg>
  );
}
