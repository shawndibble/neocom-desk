import { useTranslation } from 'react-i18next';
import { bridgeMassVerdict, holeMassVerdict } from '@/engine/route/jumpMass';
import { useRouteShipMass } from '@/features/route/routeShip';
import { createNumberFormat } from '@/lib/numberLocale';

const MT = 1_000_000;
const formatMt = createNumberFormat({ maximumFractionDigits: 1 });
const mt = (kg: number) => formatMt(kg / MT);

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
