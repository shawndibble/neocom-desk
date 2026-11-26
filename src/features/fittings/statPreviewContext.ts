import { createContext, useContext } from 'react';
import type {
  StatChange as StatChangeValue,
  StatChangeKey,
} from '@/engine/fittings/variationDelta';
import type { Section } from './stats/sectionIds';

export type Changes = ReadonlyMap<StatChangeKey, StatChangeValue>;

export const StatPreviewContext = createContext<Changes | null>(null);

export function useChangedKeys(keys: readonly StatChangeKey[] | undefined): StatChangeValue[] {
  const changes = useContext(StatPreviewContext);
  if (!changes || !keys) return [];
  return keys.flatMap((key) => {
    const change = changes.get(key);
    return change ? [change] : [];
  });
}

const SECTION_KEYS: Partial<Record<Section, readonly StatChangeKey[]>> = {
  exploration: [
    'dataStrength',
    'relicStrength',
    'virusCoherence',
    'utilitySlots',
    'hackingCycle',
    'probeStrength',
    'probeLauncherBonus',
    'probeLauncherCycle',
    'scanStrength',
    'scanTimeCut',
    'deviationCut',
    'cloakRecalibration',
    'warpsCloaked',
  ],
  offense: ['totalDps', 'totalVolley', 'sustainedDps'],
  drones: ['droneDps', 'droneBandwidthUsed', 'droneBandwidthTotal', 'droneCapacity'],
  defense: [
    'ehp',
    'shieldRepair',
    'armorRepair',
    'hullRepair',
    'shieldHp',
    'shieldEmResonance',
    'shieldThermalResonance',
    'shieldKineticResonance',
    'shieldExplosiveResonance',
    'armorHp',
    'armorEmResonance',
    'armorThermalResonance',
    'armorKineticResonance',
    'armorExplosiveResonance',
    'hullHp',
    'hullEmResonance',
    'hullThermalResonance',
    'hullKineticResonance',
    'hullExplosiveResonance',
  ],
  capacitor: ['capacitor', 'capacitorCapacity', 'capacitorRechargeTime'],
  navigation: ['maxVelocity', 'agility', 'mass', 'warpSpeed'],
  targeting: ['maxTargetRange', 'maxLockedTargets', 'scanResolution', 'signatureRadius'],
  fitting: [
    'cpuUsed',
    'cpuTotal',
    'powergridUsed',
    'powergridTotal',
    'calibrationUsed',
    'calibrationTotal',
  ],
};

export function useSectionPreviewed(id: Section): boolean {
  return useChangedKeys(SECTION_KEYS[id]).length > 0;
}
