import { FITTING_SLOT_KINDS, type Fitting, type FittingSlotKind } from './types';
import { eftMutationWriter, type AttributeNameFor } from './eftMutations';

export type ItemNameFor = (typeId: number) => string;

export function fittingItemCounts(
  fitting: Fitting,
  cloneImplants: readonly number[] = []
): Map<number, number> {
  const counts = new Map<number, number>();
  const add = (typeId: number, quantity: number) => {
    counts.set(typeId, (counts.get(typeId) ?? 0) + quantity);
  };

  add(fitting.shipTypeId, 1);
  for (const module of fitting.modules) {
    add(module.typeId, 1);
    if (module.chargeTypeId !== undefined) add(module.chargeTypeId, 1);
  }
  for (const drone of fitting.drones) add(drone.typeId, drone.quantity);
  for (const fighter of fitting.fighters ?? []) add(fighter.typeId, fighter.quantity);
  for (const item of fitting.cargo) add(item.typeId, item.quantity);
  for (const typeId of fitting.implantSet?.implants ?? []) {
    if (!cloneImplants.includes(typeId)) add(typeId, 1);
  }
  for (const typeId of fitting.implantSet?.boosters ?? []) add(typeId, 1);

  return counts;
}

const EFT_RACK_ORDER: readonly FittingSlotKind[] = ['low', 'medium', 'high', 'rig', 'subsystem'];

function headerSafe(name: string): string {
  return name.replace(/[[\]<>\r\n]+/g, ' ').trim();
}

export function fittingToEft(
  fitting: Fitting,
  nameFor: ItemNameFor,
  { attributeName }: { attributeName?: AttributeNameFor } = {}
): string {
  const mutations = eftMutationWriter(nameFor, attributeName);
  const sections: string[] = [];
  for (const rack of EFT_RACK_ORDER) {
    const lines = fitting.modules
      .filter((m) => m.slot === rack)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((m) => {
        const charge = m.chargeTypeId === undefined ? '' : `, ${nameFor(m.chargeTypeId)}`;
        const offline = m.state === 'offline' ? ' /OFFLINE' : '';
        const { name, suffix } = mutations.line(m);
        return `${name}${charge}${offline}${suffix}`;
      });
    if (lines.length > 0) sections.push(lines.join('\n'));
  }
  if (fitting.drones.length > 0) {
    sections.push(
      fitting.drones
        .map((d) => {
          const { name, suffix } = mutations.line(d);
          return `${name} x${d.quantity}${suffix}`;
        })
        .join('\n')
    );
  }
  const fighters = fitting.fighters ?? [];
  if (fighters.length > 0) {
    sections.push(fighters.map((f) => `${nameFor(f.typeId)} x${f.quantity}`).join('\n'));
  }
  if (fitting.cargo.length > 0) {
    sections.push(fitting.cargo.map((c) => `${nameFor(c.typeId)} x${c.quantity}`).join('\n'));
  }
  const mutationSection = mutations.section();
  if (mutationSection !== null) sections.push(mutationSection);

  const header = `[${nameFor(fitting.shipTypeId)}, ${headerSafe(fitting.name)}]`;
  return [[header, sections[0]].filter(Boolean).join('\n'), ...sections.slice(1)].join('\n\n');
}

export function fittingToDna(fitting: Fitting): string {
  const modules = new Map<number, number>();
  const rest = new Map<number, number>();
  const add = (into: Map<number, number>, typeId: number, quantity: number) => {
    into.set(typeId, (into.get(typeId) ?? 0) + quantity);
  };
  for (const kind of FITTING_SLOT_KINDS) {
    for (const module of fitting.modules) {
      if (module.slot === kind) add(modules, module.typeId, 1);
    }
  }
  for (const module of fitting.modules) {
    if (module.chargeTypeId !== undefined) add(rest, module.chargeTypeId, 1);
  }
  for (const drone of fitting.drones) add(rest, drone.typeId, drone.quantity);
  for (const fighter of fitting.fighters ?? []) add(rest, fighter.typeId, fighter.quantity);
  for (const item of fitting.cargo) add(rest, item.typeId, item.quantity);

  const entries = [...modules, ...rest].map(([typeId, quantity]) => `${typeId};${quantity}`);
  return `${fitting.shipTypeId}:${entries.join(':')}::`;
}

const XML_RACK: Readonly<Record<FittingSlotKind, string>> = {
  high: 'hi',
  medium: 'med',
  low: 'low',
  rig: 'rig',
  subsystem: 'subsystem',
};

function xmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function fittingToEveXml(fitting: Fitting, nameFor: ItemNameFor): string {
  const hardware = (attrs: string) => `    <hardware ${attrs}/>`;
  const lines = [
    '<?xml version="1.0" ?>',
    '<fittings>',
    `  <fitting name="${xmlAttr(fitting.name)}">`,
    '    <description value=""/>',
    `    <shipType value="${xmlAttr(nameFor(fitting.shipTypeId))}"/>`,
  ];
  for (const rack of EFT_RACK_ORDER) {
    const inRack = fitting.modules
      .filter((m) => m.slot === rack)
      .sort((a, b) => a.slotIndex - b.slotIndex);
    for (const module of inRack) {
      const slot = `${XML_RACK[rack]} slot ${module.slotIndex}`;
      lines.push(hardware(`slot="${slot}" type="${xmlAttr(nameFor(module.typeId))}"`));
    }
  }
  const drones = new Map<number, number>();
  for (const drone of fitting.drones) {
    drones.set(drone.typeId, (drones.get(drone.typeId) ?? 0) + drone.quantity);
  }
  for (const [typeId, quantity] of drones) {
    const type = xmlAttr(nameFor(typeId));
    lines.push(hardware(`qty="${quantity}" slot="drone bay" type="${type}"`));
  }
  const fighters = new Map<number, number>();
  for (const fighter of fitting.fighters ?? []) {
    fighters.set(fighter.typeId, (fighters.get(fighter.typeId) ?? 0) + fighter.quantity);
  }
  for (const [typeId, quantity] of fighters) {
    const type = xmlAttr(nameFor(typeId));
    lines.push(hardware(`qty="${quantity}" slot="fighter bay" type="${type}"`));
  }
  const cargo = new Map<number, number>();
  const carry = (typeId: number, quantity: number) =>
    cargo.set(typeId, (cargo.get(typeId) ?? 0) + quantity);
  for (const item of fitting.cargo) carry(item.typeId, item.quantity);
  for (const module of fitting.modules) {
    if (module.chargeTypeId !== undefined) carry(module.chargeTypeId, 1);
  }
  for (const [typeId, quantity] of cargo) {
    lines.push(hardware(`qty="${quantity}" slot="cargo" type="${xmlAttr(nameFor(typeId))}"`));
  }
  lines.push('  </fitting>', '</fittings>', '');
  return lines.join('\n');
}

export function fittingToMultibuy(
  fitting: Fitting,
  nameFor: ItemNameFor,
  cloneImplants: readonly number[] = [],
  owned?: ReadonlyMap<number, number>
): string {
  return [...fittingItemCounts(fitting, cloneImplants)]
    .map(([typeId, quantity]) => [typeId, Math.max(quantity - (owned?.get(typeId) ?? 0), 0)])
    .filter(([, need]) => need > 0)
    .map(([typeId, need]) => `${nameFor(typeId)}\t${need}`)
    .join('\n');
}
