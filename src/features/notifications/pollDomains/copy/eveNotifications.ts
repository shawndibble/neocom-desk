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
  push: (fire, character) => {
    assertProjectionWording('structureFuelLow', 'hedge');
    return {
      title: 'Structure fuel low',
      body: `${character}: ${fire.structureName} was due to run out of fuel.`,
    };
  },
};
