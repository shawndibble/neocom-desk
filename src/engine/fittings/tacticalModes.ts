/**
 * Tactical Destroyer modes (and the two newer hulls that carry modes the
 * same way): each hull's mode types, Defense (or Primary) first — the mode a
 * hull sits in until the pilot switches, as the game does and Pyfa assumes.
 *
 * Read out of the pinned `@eveshipfit/sde` `sde.dat` (2026-09-25): every type
 * in group 1306 ("Ship Modifiers") named "<Hull> <Kind> Mode", matched to its
 * hull by name — the SDE has no attribute tying a mode to its hull. Bump with
 * the SDE if CCP adds a hull with modes.
 */
/** What a mode is, as its SDE type name says ("Svipul Propulsion Mode"). */
export type TacticalModeKind =
  'defense' | 'propulsion' | 'sharpshooter' | 'primary' | 'secondary' | 'tertiary';

const TACTICAL_MODES: Readonly<Record<number, readonly (readonly [number, TacticalModeKind])[]>> = {
  // Confessor
  34317: [
    [34319, 'defense'],
    [34321, 'sharpshooter'],
    [34323, 'propulsion'],
  ],
  // Svipul
  34562: [
    [34564, 'defense'],
    [34566, 'propulsion'],
    [34570, 'sharpshooter'],
  ],
  // Jackdaw
  34828: [
    [35676, 'defense'],
    [35677, 'propulsion'],
    [35678, 'sharpshooter'],
  ],
  // Hecate
  35683: [
    [35686, 'defense'],
    [35687, 'propulsion'],
    [35688, 'sharpshooter'],
  ],
  // Anhinga
  89807: [
    [90061, 'primary'],
    [90063, 'secondary'],
    [90065, 'tertiary'],
  ],
  // Skua
  89808: [
    [90060, 'defense'],
    [90062, 'propulsion'],
    [90064, 'sharpshooter'],
  ],
};

const KIND_BY_MODE: ReadonlyMap<number, TacticalModeKind> = new Map(
  Object.values(TACTICAL_MODES).flat()
);

/** Every hull with modes. */
export function tacticalModeHulls(): number[] {
  return Object.keys(TACTICAL_MODES).map(Number);
}

/** The hull's mode type ids, the default first; empty for a hull without modes. */
export function tacticalModesFor(shipTypeId: number): readonly number[] {
  return (TACTICAL_MODES[shipTypeId] ?? []).map(([mode]) => mode);
}

/**
 * A mode's kind, so it can be named without its type in the catalogue
 * (`types.json` carries no Ship Modifiers); undefined for any other type.
 */
export function tacticalModeKind(modeTypeId: number): TacticalModeKind | undefined {
  return KIND_BY_MODE.get(modeTypeId);
}

/** The mode a hull flies in when none is chosen; undefined for a hull without modes. */
export function defaultTacticalMode(shipTypeId: number): number | undefined {
  return tacticalModesFor(shipTypeId)[0];
}
