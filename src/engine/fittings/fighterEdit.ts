import { fighterClass, squadronSize, type FighterClass } from './fighters';
import type { Fitting, FittingFighter } from './types';

function withFighters(fitting: Fitting, fighters: FittingFighter[]): Fitting {
  if (fighters.length > 0) return { ...fitting, fighters };
  const { fighters: _removed, ...rest } = fitting;
  void _removed;
  return rest;
}

export type FighterLimits = { tubes: number } & Record<FighterClass, number>;

export function canLaunch(
  squadrons: readonly FittingFighter[],
  typeId: number,
  limits: FighterLimits
): boolean {
  const kind = fighterClass(typeId);
  if (kind === null) return false;
  const launched = squadrons.filter((squadron) => squadron.state === 'active');
  const ofClass = launched.filter((squadron) => fighterClass(squadron.typeId) === kind);
  return launched.length < limits.tubes && ofClass.length < limits[kind];
}

export function addSquadron(
  fitting: Fitting,
  typeId: number,
  { launch }: { launch: boolean }
): Fitting {
  const squadron: FittingFighter = {
    typeId,
    quantity: squadronSize(typeId),
    state: launch ? 'active' : 'online',
  };
  return withFighters(fitting, [...(fitting.fighters ?? []), squadron]);
}

export function setSquadron(
  fitting: Fitting,
  index: number,
  change: Partial<Pick<FittingFighter, 'state' | 'quantity'>>
): Fitting {
  return withFighters(
    fitting,
    (fitting.fighters ?? []).map((squadron, i) => {
      if (i !== index) return squadron;
      const next = { ...squadron, ...change };
      next.quantity = Math.min(squadronSize(next.typeId), Math.max(1, Math.round(next.quantity)));
      return next;
    })
  );
}

export function removeSquadron(fitting: Fitting, index: number): Fitting {
  return withFighters(
    fitting,
    (fitting.fighters ?? []).filter((_, i) => i !== index)
  );
}
