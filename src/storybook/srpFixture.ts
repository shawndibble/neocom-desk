import type { SrpBackendOverride } from '@/features/corp/srpBackendOverride';
import type { SrpOfficerVerdict, SrpSettings } from '@/features/corp/srpTypes';
import { SAMPLE_ACTIVE_CHARACTER } from './sampleData';

export type SrpFixtureRole = 'director' | 'accountant' | 'ceo-not-owner';

const NOW = Date.UTC(2026, 9, 20, 12);

/** A corp's saved SRP settings: percents, a class price, a percent class and a few hulls. */
export function sampleSrpSettings(owner = SAMPLE_ACTIVE_CHARACTER.characterId): SrpSettings {
  return {
    corporationId: SAMPLE_ACTIVE_CHARACTER.corporationId,
    enabled: true,
    killmailPct: 70,
    appraisalPct: 60,
    hullRules: [
      { scope: 'class', id: 25, kind: 'pay-fixed', iskAmount: 1_500_000 },
      { scope: 'class', id: 26, kind: 'pay-percent' },
      { scope: 'class', id: 27, kind: 'pay-fixed', iskAmount: 180_000_000 },
      { scope: 'class', id: 28, kind: 'officer-decides' },
      { scope: 'class', id: 547, kind: 'not-covered' },
      { scope: 'hull', id: 627, kind: 'officer-decides' },
      { scope: 'hull', id: 17715, kind: 'not-covered' },
      { scope: 'hull', id: 641, kind: 'pay-fixed', iskAmount: 220_000_000 },
    ],
    windowDays: 30,
    requireFleetOrFc: true,
    createdBy: owner,
    createdAt: NOW,
    ownerCharacterId: owner,
    updatedAt: NOW,
    updatedBy: owner,
  };
}

/** An in-memory SRP backend for page stories: `never-on` starts with no settings doc. */
export function createSrpFixture(
  role: SrpFixtureRole,
  start: 'never-on' | 'configured'
): SrpBackendOverride {
  let settings: SrpSettings | null =
    start === 'configured'
      ? sampleSrpSettings(role === 'ceo-not-owner' ? 1 : SAMPLE_ACTIVE_CHARACTER.characterId)
      : null;
  const touch = () => settings && (settings.updatedAt += 1);
  const verdict = (): SrpOfficerVerdict => ({
    corporationId: SAMPLE_ACTIVE_CHARACTER.corporationId,
    isCeo: role === 'ceo-not-owner',
    isDirector: role !== 'accountant',
    canManage: true,
    srpEnabled: settings?.enabled === true,
    expiresAt: NOW + 86_400_000,
  });
  return {
    verify: verdict,
    readSettings: () => (settings ? { ...settings } : null),
    status: () => ({
      corporationId: SAMPLE_ACTIVE_CHARACTER.corporationId,
      enabled: settings?.enabled === true,
    }),
    turnOn: () => {
      settings = settings
        ? { ...settings, enabled: true }
        : {
            ...sampleSrpSettings(),
            enabled: true,
            killmailPct: null,
            appraisalPct: null,
            hullRules: [],
            requireFleetOrFc: false,
          };
      touch();
    },
    turnOff: () => {
      if (settings) settings = { ...settings, enabled: false };
      touch();
    },
    save: (patch) => {
      if (settings) settings = { ...settings, ...patch };
      touch();
    },
    reclaim: () => {
      if (settings)
        settings = {
          ...settings,
          enabled: true,
          ownerCharacterId: SAMPLE_ACTIVE_CHARACTER.characterId,
        };
      touch();
      return { officersRevoked: 1 };
    },
  };
}
