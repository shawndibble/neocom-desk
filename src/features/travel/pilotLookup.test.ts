import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postUniverseIds: vi.fn(),
  getCharacterPublicInfo: vi.fn(),
  loadPublicCharacterInfo: vi.fn(),
  resolveAffiliations: vi.fn(),
  resolveNames: vi.fn(),
}));

vi.mock('@/esi/endpoints', () => ({
  postUniverseIds: mocks.postUniverseIds,
  getCharacterPublicInfo: mocks.getCharacterPublicInfo,
}));
vi.mock('@/features/character/publicInfoData', () => ({
  loadPublicCharacterInfo: mocks.loadPublicCharacterInfo,
}));
vi.mock('@/features/character/affiliations', () => ({
  resolveAffiliations: mocks.resolveAffiliations,
}));
vi.mock('@/features/character/names', () => ({ resolveNames: mocks.resolveNames }));

import { EsiError } from '@/esi/errors';
import { loadPilotProfile, pilotAge, resolvePilotByName } from './pilotLookup';

describe('pilotAge', () => {
  it('counts whole years to the last anniversary, then the days since', () => {
    expect(pilotAge('2005-06-08T18:24:00Z', new Date('2026-09-30T00:00:00Z'))).toEqual({
      years: 21,
      days: 113,
    });
  });

  it('is zero years before the first anniversary', () => {
    expect(pilotAge('2026-09-01T00:00:00Z', new Date('2026-09-30T12:00:00Z'))).toEqual({
      years: 0,
      days: 29,
    });
  });

  it('turns over on the anniversary itself', () => {
    expect(pilotAge('2020-03-15T10:00:00Z', new Date('2026-03-15T10:00:00Z'))).toEqual({
      years: 6,
      days: 0,
    });
    expect(pilotAge('2020-03-15T10:00:00Z', new Date('2026-03-15T09:59:00Z'))).toEqual({
      years: 5,
      days: 364,
    });
  });

  it('is null for an unreadable or future birthday', () => {
    expect(pilotAge('nope', new Date())).toBeNull();
    expect(pilotAge('2030-01-01T00:00:00Z', new Date('2026-01-01T00:00:00Z'))).toBeNull();
  });
});

describe('resolvePilotByName', () => {
  beforeEach(() => vi.resetAllMocks());

  it('resolves an exact name through the public ids lookup', async () => {
    mocks.postUniverseIds.mockResolvedValue({ characters: [{ id: 42, name: 'Some Pilot' }] });
    expect(await resolvePilotByName('  some pilot ')).toEqual({
      characterId: 42,
      name: 'Some Pilot',
    });
    expect(mocks.postUniverseIds).toHaveBeenCalledWith(['some pilot'], { signal: undefined });
  });

  it('is null when no character has that name', async () => {
    mocks.postUniverseIds.mockResolvedValue({ systems: [{ id: 1, name: 'Jita' }] });
    expect(await resolvePilotByName('Jita')).toBeNull();
  });

  it('never asks for a blank name', async () => {
    expect(await resolvePilotByName('   ')).toBeNull();
    expect(mocks.postUniverseIds).not.toHaveBeenCalled();
  });
});

describe('loadPilotProfile', () => {
  beforeEach(() => vi.resetAllMocks());

  it('joins public info with the live affiliation and its names', async () => {
    mocks.loadPublicCharacterInfo.mockResolvedValue({
      character_id: 42,
      name: 'Some Pilot',
      birthday: '2010-01-01T00:00:00Z',
      corporation_id: 100,
      security_status: -2.345,
    });
    mocks.resolveAffiliations.mockResolvedValue(
      new Map([[42, { character_id: 42, corporation_id: 200, alliance_id: 300 }]])
    );
    mocks.resolveNames.mockResolvedValue(
      new Map([
        [200, 'New Corp'],
        [300, 'Some Alliance'],
      ])
    );
    expect(await loadPilotProfile(42)).toEqual({
      characterId: 42,
      name: 'Some Pilot',
      birthday: '2010-01-01T00:00:00Z',
      corporationId: 200,
      corporationName: 'New Corp',
      allianceId: 300,
      allianceName: 'Some Alliance',
      securityStatus: -2.345,
    });
    expect(mocks.resolveNames).toHaveBeenCalledWith([200, 300]);
  });

  it('leaves security status null when ESI omits it', async () => {
    mocks.loadPublicCharacterInfo.mockResolvedValue({
      character_id: 42,
      name: 'Some Pilot',
      birthday: '2010-01-01T00:00:00Z',
      corporation_id: 100,
    });
    mocks.resolveAffiliations.mockResolvedValue(new Map());
    mocks.resolveNames.mockResolvedValue(new Map());
    expect(await loadPilotProfile(42)).toMatchObject({ securityStatus: null });
  });

  it('falls back to the public record when no affiliation came back', async () => {
    mocks.loadPublicCharacterInfo.mockResolvedValue({
      character_id: 42,
      name: 'Some Pilot',
      birthday: '2010-01-01T00:00:00Z',
      corporation_id: 100,
    });
    mocks.resolveAffiliations.mockResolvedValue(new Map());
    mocks.resolveNames.mockResolvedValue(new Map());
    expect(await loadPilotProfile(42)).toMatchObject({
      corporationId: 100,
      corporationName: null,
      allianceId: null,
      allianceName: null,
    });
  });

  it('is null when ESI knows no such character', async () => {
    mocks.loadPublicCharacterInfo.mockResolvedValue(null);
    mocks.resolveAffiliations.mockResolvedValue(new Map());
    mocks.getCharacterPublicInfo.mockRejectedValue(new EsiError(404, 'Character not found'));
    expect(await loadPilotProfile(42)).toBeNull();
  });

  it('rejects, rather than calling the pilot unknown, when ESI could not be reached', async () => {
    mocks.loadPublicCharacterInfo.mockResolvedValue(null);
    mocks.resolveAffiliations.mockResolvedValue(new Map());
    mocks.getCharacterPublicInfo.mockRejectedValue(new EsiError(0, 'timeout'));
    await expect(loadPilotProfile(42)).rejects.toThrow('timeout');
  });
});
