import type { TFunction } from 'i18next';
import { securityBand } from '@/engine/securityStatus';

export const CUSTOMS_CODE_EXPERTISE_SKILL_ID = 33467;

export type ColonySpace = 'highsec' | 'lowsec' | 'nullsec' | 'wormhole';

export const COLONY_SPACES: readonly ColonySpace[] = [
  'highsec',
  'lowsec',
  'nullsec',
  'wormhole',
] as const;

const HIGHSEC_NPC_BASE_RATE = 0.1;

const PER_LEVEL_REDUCTION = 0.01;

const MAX_SKILL_LEVEL = 5;

export function highsecCustomsRate(level: number | null): number {
  const clamped = level == null ? 0 : Math.min(Math.max(Math.trunc(level), 0), MAX_SKILL_LEVEL);
  return HIGHSEC_NPC_BASE_RATE - clamped * PER_LEVEL_REDUCTION;
}

export function defaultCustomsRate(space: ColonySpace, level: number | null): number {
  return space === 'highsec' ? highsecCustomsRate(level) : 0;
}

export type CustomsRateSource =
  | { kind: 'highsec-skill'; level: number }
  | { kind: 'highsec-unknown-skill' }
  | { kind: 'player-poco'; space: ColonySpace };

export function customsRateSource(space: ColonySpace, level: number | null): CustomsRateSource {
  if (space !== 'highsec') return { kind: 'player-poco', space };
  if (level == null) return { kind: 'highsec-unknown-skill' };
  return {
    kind: 'highsec-skill',
    level: Math.min(Math.max(Math.trunc(level), 0), MAX_SKILL_LEVEL),
  };
}

export function customsSourceText(source: CustomsRateSource, t: TFunction): string {
  switch (source.kind) {
    case 'highsec-skill':
      return t('piShared.customsRateSource.highsec-skill', { level: source.level });
    case 'highsec-unknown-skill':
      return t('piShared.customsRateSource.highsec-unknown-skill');
    case 'player-poco':
      return t('piShared.customsRateSource.player-poco', {
        space: t(`common.spaceOption.${source.space}`),
      });
  }
}

export function colonySpaceFor(security: number | null): ColonySpace {
  return security === null ? 'highsec' : securityBand(security);
}

export function customsRatePercent(rate: number): number {
  return Math.round(rate * 10_000) / 100;
}

export function hostRateFor(
  planetId: number,
  taxRateByPlanet: ReadonlyMap<number, number> | undefined,
  taxRate: number
): number {
  return taxRateByPlanet?.get(planetId) ?? taxRate;
}
