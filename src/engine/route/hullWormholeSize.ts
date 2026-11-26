import type { WormholeShipSize } from './theraConnections';

const GROUPS_BY_SIZE: Readonly<Record<WormholeShipSize, readonly number[]>> = {
  small: [25, 324, 830, 893, 1283, 831, 1527, 834, 237, 31, 420, 541, 1305, 1534],
  medium: [26, 358, 894, 833, 906, 832, 963, 419, 1201, 540],
  large: [27, 900, 898],
  xlarge: [],
  capital: [547, 485, 4594, 659, 30, 1538, 883, 513, 902],
};

const SIZE_BY_GROUP: ReadonlyMap<number, WormholeShipSize> = new Map(
  (Object.entries(GROUPS_BY_SIZE) as [WormholeShipSize, readonly number[]][]).flatMap(
    ([size, groups]) => groups.map((groupId) => [groupId, size] as const)
  )
);

export function wormholeSizeForShipGroup(groupId: number): WormholeShipSize | null {
  return SIZE_BY_GROUP.get(groupId) ?? null;
}
