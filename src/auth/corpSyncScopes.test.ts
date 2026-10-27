import { describe, expect, it } from 'vitest';
import {
  CORP_SYNC_SCOPES as SERVER_SCOPES,
  FEEDER_SYNC_SCOPES as SERVER_FEEDER_SCOPES,
} from '../../functions/src/corpSyncScopes';
import { ESI_REGISTRY } from '@/esi/registry';
import { CORP_SYNC_SCOPES, FEEDER_SYNC_SCOPES } from './corpSyncScopes';

describe('CORP_SYNC_SCOPES', () => {
  it('is exactly what the server demands of a sync grant', () => {
    expect([...CORP_SYNC_SCOPES]).toEqual([...SERVER_SCOPES]);
  });

  it('names only scopes the app registers', () => {
    const registered = new Set<string>(Object.values(ESI_REGISTRY).map((spec) => spec.scope));
    for (const scope of CORP_SYNC_SCOPES) expect(registered).toContain(scope);
  });
});

describe('FEEDER_SYNC_SCOPES', () => {
  it('is exactly what the server demands of a moon owner grant', () => {
    expect([...FEEDER_SYNC_SCOPES]).toEqual([...SERVER_FEEDER_SCOPES]);
  });
});
