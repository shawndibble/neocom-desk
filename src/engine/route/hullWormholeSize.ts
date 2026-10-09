/**
 * The smallest wormhole size a hull needs, from its SDE ship group (issue
 * #2850). Used to prefill Route Safety's "My ship fits" when a link knows
 * which hull is flying.
 *
 * Deliberately conservative: a hull whose mass varies too much within its
 * group to name one size (industrials, mining barges, Orca, Rorqual) is
 * left out, so nothing is prefilled and the saved default stands. Every
 * capital-class hull maps to `capital`, the largest size, so the route never
 * claims a hole fits a ship it might not.
 */
import type { WormholeShipSize } from './theraConnections';

const GROUPS_BY_SIZE: Readonly<Record<WormholeShipSize, readonly number[]>> = {
  // Frigate, Assault Frigate, Covert Ops, Electronic Attack Ship, Expedition
  // Frigate, Interceptor, Logistics Frigate, Stealth Bomber, Rookie Ship,
  // Shuttle, Destroyer, Interdictor, Tactical Destroyer, Command Destroyer.
  small: [25, 324, 830, 893, 1283, 831, 1527, 834, 237, 31, 420, 541, 1305, 1534],
  // Cruiser, Heavy Assault Cruiser, Heavy Interdiction Cruiser, Force Recon,
  // Combat Recon, Logistics, Strategic Cruiser, Battlecruiser, Attack
  // Battlecruiser, Command Ship.
  medium: [26, 358, 894, 833, 906, 832, 963, 419, 1201, 540],
  // Battleship, Marauder, Black Ops.
  large: [27, 900, 898],
  xlarge: [],
  // Carrier, Dreadnought, Lancer Dreadnought, Supercarrier, Titan, Force
  // Auxiliary, Capital Industrial Ship, Freighter, Jump Freighter.
  capital: [547, 485, 4594, 659, 30, 1538, 883, 513, 902],
};

const SIZE_BY_GROUP: ReadonlyMap<number, WormholeShipSize> = new Map(
  (Object.entries(GROUPS_BY_SIZE) as [WormholeShipSize, readonly number[]][]).flatMap(
    ([size, groups]) => groups.map((groupId) => [groupId, size] as const)
  )
);

/** The size a ship group needs, or null when the group is not one this names. */
export function wormholeSizeForShipGroup(groupId: number): WormholeShipSize | null {
  return SIZE_BY_GROUP.get(groupId) ?? null;
}
