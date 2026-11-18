/**
 * Which products a Standup engineering rig covers (issue #6392).
 *
 * In the game every engineering rig boosts only certain product classes: a
 * Basic Capital Component rig does nothing for capital hulls, and the reverse.
 * The bonus numbers are the same for every rig (see `RIG_KIND_BONUS`); only the
 * scope differs, and only in dogma's free-text attribute descriptions, so the
 * product -> scope map is hand curated at bake time
 * (`scripts/lib/rigScope.mjs`, which pins those descriptions and bakes the
 * result into `blueprints.json` as `rigScope`). This module owns the other
 * half: which scopes each rig covers.
 *
 * A rig kind is `<line><tier>` (the original `meT1`..`teT2`, still meaning "applies to every
 * product", so saved fits keep their old value) or `<line><tier>:<target>`.
 */

/** Product classes the bake sorts a manufactured product into. Keep in step with `scripts/lib/rigScope.mjs`. */
export const PRODUCT_RIG_SCOPES = [
  'equipment',
  'ammo',
  'drone',
  'basSmall',
  'basMedium',
  'basLarge',
  'advSmall',
  'advMedium',
  'advLarge',
  'capShip',
  'advComp',
  'advCapComp',
  'basCapComp',
  'structure',
] as const;

export type ProductRigScope = (typeof PRODUCT_RIG_SCOPES)[number];

const ALL_SHIPS = [
  'basSmall',
  'basMedium',
  'basLarge',
  'advSmall',
  'advMedium',
  'advLarge',
  'capShip',
] as const satisfies readonly ProductRigScope[];

/**
 * Each rig group a pilot can fit, and the product scopes it covers. M and L rigs of a
 * group cover the same scopes (and give the same bonus), so size is not modelled; the XL rigs are
 * coarser groups. Source: dogma rig effects -> structure attributes (rigAdvComponent... covers both
 * the T2 component and T2 capital component attributes).
 */
export const RIG_TARGETS = {
  equipment: ['equipment'],
  ammo: ['ammo'],
  drone: ['drone'],
  basSmall: ['basSmall'],
  basMedium: ['basMedium'],
  basLarge: ['basLarge'],
  advSmall: ['advSmall'],
  advMedium: ['advMedium'],
  advLarge: ['advLarge'],
  capShip: ['capShip'],
  advComp: ['advComp', 'advCapComp'],
  basCapComp: ['basCapComp'],
  structure: ['structure'],
  xlConsumable: ['equipment', 'ammo', 'drone'],
  xlShip: ALL_SHIPS,
  xlComponent: ['advComp', 'advCapComp', 'basCapComp', 'structure'],
} as const satisfies Record<string, readonly ProductRigScope[]>;

export type RigTarget = keyof typeof RIG_TARGETS;

export const RIG_TARGET_IDS = Object.keys(RIG_TARGETS) as RigTarget[];

export type RigLine = 'me' | 'te';
export type RigTier = 'T1' | 'T2';
/** The original unscoped rig kinds: `meT1`, `meT2`, `teT1`, `teT2`. They apply to every product. */
export type UnscopedRigKind = `${RigLine}${RigTier}`;
export type ScopedRigKind = `${UnscopedRigKind}:${RigTarget}`;

export interface ParsedRigKind {
  line: RigLine;
  tier: RigTier;
  /** Absent for an unscoped rig, which applies to every product. */
  target: RigTarget | undefined;
}

/** Reads a stored rig kind; `null` for `'none'` and for anything this build does not know (a record from a newer client). */
export function parseRigKind(kind: string): ParsedRigKind | null {
  const match = /^(me|te)(T1|T2)(?::(\w+))?$/.exec(kind);
  if (!match) return null;
  const target = match[3];
  if (target !== undefined && !(target in RIG_TARGETS)) return null;
  return {
    line: match[1] as RigLine,
    tier: match[2] as RigTier,
    target: target as RigTarget | undefined,
  };
}

export function scopedRigKind(line: RigLine, tier: RigTier, target: RigTarget): ScopedRigKind {
  return `${line}${tier}:${target}`;
}

/** Whether a rig reaches a product. An unscoped rig reaches everything; a scoped one needs a known product scope it covers. */
export function rigReaches(
  target: RigTarget | undefined,
  scope: ProductRigScope | undefined
): boolean {
  if (target === undefined) return true;
  return scope !== undefined && (RIG_TARGETS[target] as readonly string[]).includes(scope);
}

/** The fitted rigs (either line) that apply to a product of `scope`, in slot order. */
export function rigKindsApplyingTo(
  fit: readonly string[],
  scope: ProductRigScope | undefined
): string[] {
  return fit.filter((kind) => {
    const parsed = parseRigKind(kind);
    return parsed !== null && rigReaches(parsed.target, scope);
  });
}
