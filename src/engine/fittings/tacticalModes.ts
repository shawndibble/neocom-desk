export type TacticalModeKind =
  'defense' | 'propulsion' | 'sharpshooter' | 'primary' | 'secondary' | 'tertiary';

const TACTICAL_MODES: Readonly<Record<number, readonly (readonly [number, TacticalModeKind])[]>> = {
  34317: [
    [34319, 'defense'],
    [34321, 'sharpshooter'],
    [34323, 'propulsion'],
  ],
  34562: [
    [34564, 'defense'],
    [34566, 'propulsion'],
    [34570, 'sharpshooter'],
  ],
  34828: [
    [35676, 'defense'],
    [35677, 'propulsion'],
    [35678, 'sharpshooter'],
  ],
  35683: [
    [35686, 'defense'],
    [35687, 'propulsion'],
    [35688, 'sharpshooter'],
  ],
  89807: [
    [90061, 'primary'],
    [90063, 'secondary'],
    [90065, 'tertiary'],
  ],
  89808: [
    [90060, 'defense'],
    [90062, 'propulsion'],
    [90064, 'sharpshooter'],
  ],
};

const KIND_BY_MODE: ReadonlyMap<number, TacticalModeKind> = new Map(
  Object.values(TACTICAL_MODES).flat()
);

export function tacticalModeHulls(): number[] {
  return Object.keys(TACTICAL_MODES).map(Number);
}

export function tacticalModesFor(shipTypeId: number): readonly number[] {
  return (TACTICAL_MODES[shipTypeId] ?? []).map(([mode]) => mode);
}

export function tacticalModeKind(modeTypeId: number): TacticalModeKind | undefined {
  return KIND_BY_MODE.get(modeTypeId);
}

export function defaultTacticalMode(shipTypeId: number): number | undefined {
  return tacticalModesFor(shipTypeId)[0];
}
