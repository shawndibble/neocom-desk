import { Link } from 'react-router-dom';
import { inlineLinkClassName } from '@/components/ui/controlStyles';
import { piColonyHref } from '../piPlanLink';
import type { PlanNames } from './format';

/** A colony's name, linking to the colony. */
export function ColonyLink({ planetId, names }: { planetId: number; names: PlanNames }) {
  return (
    <Link className={inlineLinkClassName} to={piColonyHref(planetId)}>
      {names.planet(planetId)}
    </Link>
  );
}
