/**
 * Edits to a Fitting's fighter squadrons — pure, `(Fitting) => Fitting`, the
 * shape the editor's `edit()` applies. A squadron is added full and launched
 * while the hull has a tube free (the caller knows, from the stats), else to
 * the bay; its size stays between one fighter and a full squadron.
 */
import { squadronSize } from './fighters';
import type { Fitting, FittingFighter } from './types';

function withFighters(fitting: Fitting, fighters: FittingFighter[]): Fitting {
  if (fighters.length > 0) return { ...fitting, fighters };
  const { fighters: _removed, ...rest } = fitting;
  void _removed;
  return rest;
}

export function addSquadron(
  fitting: Fitting,
  typeId: number,
  { freeTubes }: { freeTubes: number }
): Fitting {
  const squadron: FittingFighter = {
    typeId,
    quantity: squadronSize(typeId),
    state: freeTubes > 0 ? 'active' : 'online',
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
