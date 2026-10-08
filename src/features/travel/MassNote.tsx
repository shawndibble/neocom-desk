/**
 * The inline note under a wormhole or bridge hop the chosen ship is too heavy
 * for (issue #2906). Progressive: it renders nothing for a ship that can pass,
 * or when no ship is chosen. Only the per-jump limit is a claim (hull mass
 * against the hole type's limit); what a hole has left is not known.
 */
import { useTranslation } from 'react-i18next';
import { bridgeMassVerdict, holeMassVerdict } from '@/engine/route/jumpMass';
import { useRouteShipMass } from '@/features/route/routeShip';

const MT = 1_000_000;
const mt = (kg: number) => Math.round(kg / MT).toLocaleString();

export function MassNote({ hole }: { hole: { wormholeType: string | null } | 'bridge' }) {
  const { t } = useTranslation();
  const { ship, holeTable } = useRouteShipMass();
  if (ship === null) return null;
  const verdict =
    hole === 'bridge'
      ? bridgeMassVerdict(ship.massKg)
      : holeMassVerdict(hole.wormholeType, ship.massKg, holeTable);
  if (verdict.kind === 'ok') return null;
  return (
    <p role="note" className="w-full text-warning">
      {t(hole === 'bridge' ? 'travel.bridges.tooHeavy' : 'travel.holes.tooHeavy', {
        limit: mt(verdict.limitKg),
        ship: ship.name,
        mass: mt(verdict.shipKg),
      })}
    </p>
  );
}
