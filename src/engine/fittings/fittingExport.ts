/**
 * A Fitting as text other tools read (issue #1543): EFT (EVE Workbench, Pyfa,
 * Discord), a DNA string / in-game chat link, and a multibuy list. Each one
 * has a Load counterpart (`eftLoader.ts`, `linkLoader.ts`) and a test that
 * round-trips it, so what is copied here can be pasted straight back in.
 *
 * `fittingItemCounts` is the one "what does this Fitting contain" tally, shared
 * with the price (`features/fittings/fittingPrice.ts`) so the multibuy list and
 * the price always cover the same items in the same quantities.
 */
import { FITTING_SLOT_KINDS, type Fitting, type FittingSlotKind } from './types';

export type ItemNameFor = (typeId: number) => string;

/** Hull, every module, loaded charge, drone stack and cargo stack, summed per type. */
export function fittingItemCounts(fitting: Fitting): Map<number, number> {
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

  return counts;
}

/** EFT lists the racks in this order, low first. */
const EFT_RACK_ORDER: readonly FittingSlotKind[] = ['low', 'medium', 'high', 'rig', 'subsystem'];

/** The name sits inside `[Hull, Name]` and `<url=…>Name</url>`; brackets, angle brackets and newlines would end or split either. */
function headerSafe(name: string): string {
  return name.replace(/[[\]<>\r\n]+/g, ' ').trim();
}

export function fittingToEft(fitting: Fitting, nameFor: ItemNameFor): string {
  const sections: string[] = [];
  for (const rack of EFT_RACK_ORDER) {
    const lines = fitting.modules
      .filter((m) => m.slot === rack)
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map((m) => {
        const charge = m.chargeTypeId === undefined ? '' : `, ${nameFor(m.chargeTypeId)}`;
        const offline = m.state === 'offline' ? ' /OFFLINE' : '';
        return `${nameFor(m.typeId)}${charge}${offline}`;
      });
    if (lines.length > 0) sections.push(lines.join('\n'));
  }
  if (fitting.drones.length > 0) {
    sections.push(fitting.drones.map((d) => `${nameFor(d.typeId)} x${d.quantity}`).join('\n'));
  }
  // A squadron a line, after the drones, as Pyfa writes them.
  const fighters = fitting.fighters ?? [];
  if (fighters.length > 0) {
    sections.push(fighters.map((f) => `${nameFor(f.typeId)} x${f.quantity}`).join('\n'));
  }
  if (fitting.cargo.length > 0) {
    sections.push(fitting.cargo.map((c) => `${nameFor(c.typeId)} x${c.quantity}`).join('\n'));
  }

  const header = `[${nameFor(fitting.shipTypeId)}, ${headerSafe(fitting.name)}]`;
  // Header directly above the first rack, as in the game's own export.
  return [[header, sections[0]].filter(Boolean).join('\n'), ...sections.slice(1)].join('\n\n');
}

/**
 * The game's DNA: `hull:typeId;qty:typeId;qty::`. Slotted modules, then
 * charges, drones and cargo, each type once with its total quantity — DNA has
 * no slot information (the same reason `loadDnaFitting` reads a rack from
 * `FittingSlotMap`).
 */
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

/** What pasted into game chat becomes a clickable fitting link. */
export function fittingToChatLink(fitting: Fitting): string {
  return `<url=fitting:${fittingToDna(fitting)}>${headerSafe(fitting.name)}</url>`;
}

/** How the game's fittings XML names each rack's slots (`hi slot 0`, `med slot 2`…). */
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

/**
 * The game's fittings XML (the fitting window's "Import from file"), as the
 * game and pyfa write it: one `<hardware>` per module by rack and slot,
 * `drone bay` stacks, and `cargo`. The format has nowhere to load a charge
 * into a module, so — as pyfa does — each loaded charge is carried as cargo
 * instead, one per module loading it, beside any cargo of that type.
 */
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
  // One line per drone type: the file has no in-space/in-bay split to keep.
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

/** One `name<TAB>quantity` line per item — the shape the game's multibuy and Appraisal both read. */
export function fittingToMultibuy(fitting: Fitting, nameFor: ItemNameFor): string {
  return [...fittingItemCounts(fitting)]
    .map(([typeId, quantity]) => `${nameFor(typeId)}\t${quantity}`)
    .join('\n');
}
