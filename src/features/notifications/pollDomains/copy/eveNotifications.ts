import type {
  EveNotificationFire,
  StructureReinforcementExitFire,
  StructureFuelLowFire,
} from '@/engine/notificationDiffs';
import {
  assertProjectionWording,
  type PushCopy,
  type ReinforcementExitNames,
} from '@/engine/projection';
import { eveNotificationText, type EveNotificationNames } from '../../eveNotificationText';
import { type DomainCopy, type NoNames, simple, DAY_MS } from './shared';

/**
 * Best structure label available, in the same preference order as
 * `eveNotificationText.ts`'s `structureLabel` — never nothing, since "exits
 * reinforcement soon" with no subject is worse than a generic body.
 */
function reinforcementExitLabel(names: ReinforcementExitNames): string {
  if (names.payloadStructureName !== undefined) return names.payloadStructureName;
  if (names.resolvedStructureName !== undefined) return names.resolvedStructureName;
  if (names.structureId !== undefined) return `structure #${names.structureId}`;
  return 'a structure';
}

export const eveNotificationCopy: DomainCopy<EveNotificationFire, EveNotificationNames> & {
  readonly push: PushCopy<StructureReinforcementExitFire, ReinforcementExitNames>;
} = {
  poll: (fire, character, names) => eveNotificationText(fire, { name: character }, names),
  push: (_fire, character, names) => {
    assertProjectionWording('eveNotification', 'assert');
    return {
      title: 'Structure coming out of reinforcement',
      body: `${character}: ${reinforcementExitLabel(names)} exits reinforcement soon.`,
    };
  },
};

export const structureFuelCopy: DomainCopy<StructureFuelLowFire, NoNames> & {
  readonly push: PushCopy<StructureFuelLowFire, NoNames>;
} = {
  poll: (fire, character) =>
    simple('structureFuelLow', {
      character,
      structure: fire.structureName,
      days: Math.round(fire.thresholdMs / DAY_MS),
    }),
  /**
   * Hedged for the planetary events' reason: "was due to run out" rather than
   * "is low", because a refuel performed in game while the app is closed
   * makes the assertive phrasing plainly wrong and nothing re-checks before
   * the push goes out.
   *
   * Its title stays assertive where theirs do not — "Structure fuel low" is a
   * standing condition a refuel resolves, not a moment this push claims to
   * have witnessed, so it reads as stale rather than false.
   */
  push: (fire, character) => {
    assertProjectionWording('structureFuelLow', 'hedge');
    return {
      title: 'Structure fuel low',
      body: `${character}: ${fire.structureName} was due to run out of fuel.`,
    };
  },
};
