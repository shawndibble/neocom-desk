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
      <path d={d} className="isis-pipe-glow" />
      <path d={d} className="isis-pipe-lit" />
      <path d={d} className="isis-pipe-core" />
    </g>
  ) : (
    <g data-lit="false">
      <path d={d} className="isis-pipe-dim" />
      <path d={d} className="isis-pipe-dim-core" />
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
            <path d={d} className="isis-pipe-dim" />
            <path d={d} className="isis-pipe-dim-core" />
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
          <polygon points="-8,-14 8,-14 16,0 8,14 -8,14 -16,0" className="isis-omega-hex" />
          <text y={5} textAnchor="middle" className="isis-omega-glyph">
            Ω
          </text>
        </g>
      ))}
      <image href={CAPSULE_ICON_URL} x={root.x - 2} y={root.y - 16} width={32} height={32} />
    </svg>
  );
}
