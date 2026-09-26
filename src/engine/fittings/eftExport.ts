/**
 * Turns a domain `Fitting` into EFT text — the export half of `eftLoader.ts`'s
 * load (issue #1544's Copy EFT action, planned in the scope decision's "Load
 * and export formats" bullet). Pure: takes a `typeId -> name` lookup rather
 * than importing a loader, matching every other module in this directory.
 *
 * Only `state: 'offline'` gets a written suffix — `/offline` is the one
 * per-item state EFT's own format has room for; `eftLoader.ts` never tracks
 * it back on load anyway (it strips the suffix, matching in-game import), so
 * this is one-way fidelity, not a round-trippable state.
 */
import { FITTING_SLOT_KINDS } from './types';
import type { Fitting, FittingModule } from './types';

function moduleLine(module: FittingModule, typeName: (typeId: number) => string): string {
  const charge = module.chargeTypeId === undefined ? '' : `, ${typeName(module.chargeTypeId)}`;
  const offline = module.state === 'offline' ? ' /OFFLINE' : '';
  return `${typeName(module.typeId)}${charge}${offline}`;
}

export function fittingToEft(fitting: Fitting, typeName: (typeId: number) => string): string {
  const header = `[${typeName(fitting.shipTypeId)}, ${fitting.name}]`;

  const sections: string[][] = [];
  for (const rack of FITTING_SLOT_KINDS) {
    const lines = fitting.modules
      .filter((module) => module.slot === rack)
      .map((module) => moduleLine(module, typeName));
    if (lines.length > 0) sections.push(lines);
  }
  if (fitting.drones.length > 0) {
    sections.push(fitting.drones.map((drone) => `${typeName(drone.typeId)} x${drone.quantity}`));
  }
  const fighters = fitting.fighters ?? [];
  if (fighters.length > 0) {
    sections.push(fighters.map((fighter) => `${typeName(fighter.typeId)} x${fighter.quantity}`));
  }
  if (fitting.cargo.length > 0) {
    sections.push(fitting.cargo.map((item) => `${typeName(item.typeId)} x${item.quantity}`));
  }

  return [header, ...sections.map((lines) => lines.join('\n'))].join('\n\n');
}
