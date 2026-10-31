import { createContext, useContext } from 'react';
import type {
  StatChange as StatChangeValue,
  StatChangeKey,
} from '@/engine/fittings/variationDelta';
import type { Section } from './stats/sectionIds';

export type Changes = ReadonlyMap<StatChangeKey, StatChangeValue>;

export const StatPreviewContext = createContext<Changes | null>(null);

/** The previewed changes among `keys`, in `keys` order. */
export function useChangedKeys(keys: readonly StatChangeKey[] | undefined): StatChangeValue[] {
  const changes = useContext(StatPreviewContext);
  if (!changes || !keys) return [];
  return keys.flatMap((key) => {
    const change = changes.get(key);
    return change ? [change] : [];
  });
}

/** The stats each collapsible section shows, so its header can say a change is inside it. */
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

/** True when a previewed change sits inside section `id`. */
export function useSectionPreviewed(id: Section): boolean {
  return useChangedKeys(SECTION_KEYS[id]).length > 0;
}
