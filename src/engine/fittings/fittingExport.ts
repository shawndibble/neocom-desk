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
  for (const item of fitting.cargo) add(item.typeId, item.quantity);

  return counts;
}

/** EFT lists the racks in this order, low first. */
const EFT_RACK_ORDER: readonly FittingSlotKind[] = ['low', 'medium', 'high', 'rig', 'subsystem'];

/** The header is `[Hull, Name]`; a `]` or newline in the name would end or split it. */
function headerSafe(name: string): string {
  return name.replace(/[\]\r\n]+/g, ' ').trim();
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
  for (const item of fitting.cargo) add(rest, item.typeId, item.quantity);

  const entries = [...modules, ...rest].map(([typeId, quantity]) => `${typeId};${quantity}`);
  return `${fitting.shipTypeId}:${entries.join(':')}::`;
}

/** What pasted into game chat becomes a clickable fitting link. */
export function fittingToChatLink(fitting: Fitting): string {
  return `<url=fitting:${fittingToDna(fitting)}>${headerSafe(fitting.name)}</url>`;
}

/** One `name<TAB>quantity` line per item — the shape the game's multibuy and Appraisal both read. */
export function fittingToMultibuy(fitting: Fitting, nameFor: ItemNameFor): string {
  return [...fittingItemCounts(fitting)]
    .map(([typeId, quantity]) => `${nameFor(typeId)}\t${quantity}`)
    .join('\n');
}
