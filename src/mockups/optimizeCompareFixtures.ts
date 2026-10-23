/**
 * Sample "Optimize for me" result for the compare-preview mockup: the
 * missile pilot's imported queue (`queueRemapFixtures.ts`), the order the
 * optimizer proposes, and the two Remap Markers it places. Figures match the
 * #4701 sample (the plan saves 15d 12h).
 */

export interface CompareStep {
  name: string;
  /** Position in the current plan; the row moved when it differs from its new position. */
  from: number;
}

export type CompareRow =
  { kind: 'step'; step: CompareStep; position: number } | { kind: 'remap'; text: string };

const CURRENT = [
  'Caldari Battleship V',
  'Cruise Missiles V',
  'Cruise Missile Specialization III',
  'Cruise Missile Specialization IV',
  'Warhead Upgrades V',
  'Missile Bombardment V',
  'Shield Management V',
  'Tactical Shield Manipulation V',
  'Capacitor Management V',
  'Energy Grid Upgrades V',
  'Thermodynamics IV',
  'Heavy Drone Operation V',
  'Drone Interfacing V',
];

/** New order, by name; `from` is looked up in CURRENT. `null` is a remap marker. */
const PROPOSED: readonly (string | { remap: string })[] = [
  'Missile Bombardment V',
  'Cruise Missiles V',
  'Caldari Battleship V',
  'Cruise Missile Specialization III',
  'Cruise Missile Specialization IV',
  'Warhead Upgrades V',
  { remap: 'Remap to Intelligence 27 · Memory 21 · Perception 17 · Willpower 17 · Charisma 17' },
  'Energy Grid Upgrades V',
  'Capacitor Management V',
  'Shield Management V',
  'Tactical Shield Manipulation V',
  'Thermodynamics IV',
  { remap: 'Remap to Memory 27 · Perception 21 · Intelligence 17 · Willpower 17 · Charisma 17' },
  'Heavy Drone Operation V',
  'Drone Interfacing V',
];

export const CURRENT_ROWS: CompareRow[] = CURRENT.map((name, i) => ({
  kind: 'step',
  step: { name, from: i + 1 },
  position: i + 1,
}));

export const PROPOSED_ROWS: CompareRow[] = (() => {
  let position = 0;
  return PROPOSED.map((item): CompareRow => {
    if (typeof item !== 'string') return { kind: 'remap', text: item.remap };
    position += 1;
    return { kind: 'step', step: { name: item, from: CURRENT.indexOf(item) + 1 }, position };
  });
})();

/** Where a current step lands in the proposal, for the "moves to" note. */
export function newPositionOf(name: string): number {
  const row = PROPOSED_ROWS.find((r) => r.kind === 'step' && r.step.name === name);
  return row?.kind === 'step' ? row.position : 0;
}

export const TOTAL_BEFORE = '61d 4h';
export const TOTAL_AFTER = '45d 16h';
export const SAVED = '15d 12h';
export const MOVED_COUNT = PROPOSED_ROWS.filter(
  (r) => r.kind === 'step' && r.step.from !== r.position
).length;
