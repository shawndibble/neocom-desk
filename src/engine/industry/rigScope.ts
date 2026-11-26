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
export type UnscopedRigKind = `${RigLine}${RigTier}`;
export type ScopedRigKind = `${UnscopedRigKind}:${RigTarget}`;

export interface ParsedRigKind {
  line: RigLine;
  tier: RigTier;
  target: RigTarget | undefined;
}

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

export function rigReaches(
  target: RigTarget | undefined,
  scope: ProductRigScope | undefined
): boolean {
  if (target === undefined) return true;
  return scope !== undefined && (RIG_TARGETS[target] as readonly string[]).includes(scope);
}

export function rigKindsApplyingTo(
  fit: readonly string[],
  scope: ProductRigScope | undefined
): string[] {
  return fit.filter((kind) => {
    const parsed = parseRigKind(kind);
    return parsed !== null && rigReaches(parsed.target, scope);
  });
}
