import type { SrpBackendOverride } from '@/features/corp/srpBackendOverride';
import type { SrpDoctrineBackendOverride } from '@/features/corp/srpDoctrineBackendOverride';
import type { DoctrineFit, SrpOfficerVerdict, SrpSettings } from '@/features/corp/srpTypes';
import { SAMPLE_ACTIVE_CHARACTER } from './sampleData';
import { DAY_MS } from '@/lib/age';

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
      { scope: 'hull', id: 24702, kind: 'pay-percent', doctrineIds: ['d-hurricane'] },
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

/** Real SDE type ids: a Hurricane armour brawl and a second Hurricane fit, and a Cerberus. */
export function sampleDoctrineFits(): DoctrineFit[] {
  const by = SAMPLE_ACTIVE_CHARACTER.characterId;
  return [
    {
      id: 'd-hurricane',
      name: 'Hurricane - artillery',
      snapshot: {
        hullTypeId: 24702,
        name: 'Hurricane - artillery',
        modules: [2048, 2969, 2969, 2969, 2969, 3530, 12058],
        rigs: [31055, 31059],
      },
      createdBy: by,
      createdAt: NOW - 3 * DAY_MS,
    },
    {
      id: 'd-hurricane-armour',
      name: 'Hurricane - armour',
      snapshot: {
        hullTypeId: 24702,
        name: 'Hurricane - armour',
        modules: [2048, 3530, 20351, 12058, 2969, 2969],
        rigs: [31055, 31055],
      },
      createdBy: by,
      createdAt: NOW - 2 * DAY_MS,
    },
    {
      id: 'd-cerberus',
      name: 'Cerberus - shield',
      snapshot: {
        hullTypeId: 11993,
        name: 'Cerberus - shield',
        modules: [2024, 527, 448, 1999],
        rigs: [31796],
      },
      createdBy: by,
      createdAt: NOW - DAY_MS,
    },
  ];
}

/** An in-memory Doctrine Fit store for page stories; `start: 'empty'` has none. */
export function createDoctrineFixture(start: 'sample' | 'empty'): SrpDoctrineBackendOverride {
  let fits = start === 'sample' ? sampleDoctrineFits() : [];
  return {
    list: () => [...fits].sort((a, b) => b.createdAt - a.createdAt),
    save: (input) => {
      const id = input.id ?? `d-new-${fits.length + 1}`;
      const fit: DoctrineFit = {
        id,
        name: input.name,
        snapshot: { ...input.snapshot, name: input.name },
        createdBy: SAMPLE_ACTIVE_CHARACTER.characterId,
        createdAt: Date.now(),
      };
      fits = [...fits.filter((f) => f.id !== id), fit];
      return { id };
    },
    remove: (id) => {
      fits = fits.filter((f) => f.id !== id);
    },
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
    settingsExist: settings !== null,
    expiresAt: NOW + DAY_MS,
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
