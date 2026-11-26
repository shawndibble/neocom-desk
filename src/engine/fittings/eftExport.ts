import { FITTING_SLOT_KINDS } from './types';
import type { Fitting, FittingModule } from './types';
import { eftMutationWriter, type AttributeNameFor, type EftMutationWriter } from './eftMutations';

function moduleLine(
  module: FittingModule,
  typeName: (typeId: number) => string,
  mutations: EftMutationWriter
): string {
  const charge = module.chargeTypeId === undefined ? '' : `, ${typeName(module.chargeTypeId)}`;
  const offline = module.state === 'offline' ? ' /OFFLINE' : '';
  const { name, suffix } = mutations.line(module);
  return `${name}${charge}${offline}${suffix}`;
}

export function fittingToEft(
  fitting: Fitting,
  typeName: (typeId: number) => string,
  { attributeName }: { attributeName?: AttributeNameFor } = {}
): string {
  const header = `[${typeName(fitting.shipTypeId)}, ${fitting.name}]`;
  const mutations = eftMutationWriter(typeName, attributeName);

  const sections: string[][] = [];
  for (const rack of FITTING_SLOT_KINDS) {
    const lines = fitting.modules
      .filter((module) => module.slot === rack)
      .map((module) => moduleLine(module, typeName, mutations));
    if (lines.length > 0) sections.push(lines);
  }
  if (fitting.drones.length > 0) {
    sections.push(
      fitting.drones.map((drone) => {
        const { name, suffix } = mutations.line(drone);
        return `${name} x${drone.quantity}${suffix}`;
      })
    );
  }
  const fighters = fitting.fighters ?? [];
  if (fighters.length > 0) {
    sections.push(fighters.map((fighter) => `${typeName(fighter.typeId)} x${fighter.quantity}`));
  }
  if (fitting.cargo.length > 0) {
    sections.push(fitting.cargo.map((item) => `${typeName(item.typeId)} x${item.quantity}`));
  }
  const mutationSection = mutations.section();
  if (mutationSection !== null) sections.push([mutationSection]);

  return [header, ...sections.map((lines) => lines.join('\n'))].join('\n\n');
}
