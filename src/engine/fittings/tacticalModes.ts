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
const TACTICAL_MODES: Readonly<Record<number, readonly number[]>> = {
  // Confessor: Defense, Sharpshooter, Propulsion.
  34317: [34319, 34321, 34323],
  // Svipul: Defense, Propulsion, Sharpshooter.
  34562: [34564, 34566, 34570],
  // Jackdaw: Defense, Propulsion, Sharpshooter.
  34828: [35676, 35677, 35678],
  // Hecate: Defense, Propulsion, Sharpshooter.
  35683: [35686, 35687, 35688],
  // Anhinga: Primary, Secondary, Tertiary.
  89807: [90061, 90063, 90065],
  // Skua: Defense, Propulsion, Sharpshooter.
  89808: [90060, 90062, 90064],
};

/** The hull's mode type ids, the default first; empty for a hull without modes. */
export function tacticalModesFor(shipTypeId: number): readonly number[] {
  return TACTICAL_MODES[shipTypeId] ?? [];
}

/** The mode a hull flies in when none is chosen; undefined for a hull without modes. */
export function defaultTacticalMode(shipTypeId: number): number | undefined {
  return tacticalModesFor(shipTypeId)[0];
}
