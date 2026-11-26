import type { Fitting, HardpointCounts } from './types';

export type HardpointKind = 'turret' | 'launcher';

export type HardpointKindOf = (typeId: number) => HardpointKind | null | undefined;

export function countHardpoints(fitting: Fitting, kindOf: HardpointKindOf): HardpointCounts | null {
  const used: HardpointCounts = { turrets: 0, launchers: 0 };
  for (const module of fitting.modules) {
    if (module.slot !== 'high') continue;
    const kind = kindOf(module.typeId);
    if (kind === undefined) return null;
    if (kind === 'turret') used.turrets += 1;
    else if (kind === 'launcher') used.launchers += 1;
  }
  return used;
}
