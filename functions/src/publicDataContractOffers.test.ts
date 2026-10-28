import { describe, expect, it } from 'vitest';
import type { ContractItemRecord, ContractRecord } from './publicContracts.js';
import {
  ARCHIVE_FINGERPRINT_R2_KEY,
  COURIERS_STATE_R2_KEY,
  OFFERS_STATE_R2_KEY,
  publishPublicContractOffers,
  TYPE_HASHES_R2_KEY,
} from './publicDataContractOffers.js';

const NOW = Date.parse('2026-09-08T18:00:00Z');
const FUTURE = '2026-09-09T18:00:00Z';

const contract: ContractRecord = {
  contract_id: '1',
  date_expired: FUTURE,
  price: '500000',
  buyout: '',
  start_location_id: '60005668',
  title: '',
  type: 'item_exchange',
  region_id: '10000043',
  end_location_id: '60005668',
  reward: '0',
  collateral: '0',
  volume: '100',
  days_to_complete: '0',
};
const item: ContractItemRecord = {
  is_blueprint_copy: '',
  is_included: 'true',
  material_efficiency: '',
  quantity: '1',
  runs: '',
  time_efficiency: '',
  type_id: '47789',
  contract_id: '1',
};

/** An in-memory R2: `get` reads what `put` stored, as JSON. */
function fakeR2() {
  const objects = new Map<string, string>();
  return {
    objects,
    get: async (key: string) => (objects.has(key) ? JSON.parse(objects.get(key) as string) : null),
    put: async (key: string, body: Buffer | string) => {
      objects.set(key, body.toString());
    },
  };
}

function archive(fingerprint: string | null) {
  return {
    fetchArchiveFingerprint: async () => fingerprint,
    streamPublicContractsCsvs: async (handlers: {
      onContract: (c: ContractRecord) => void;
      onItem: (i: ContractItemRecord) => void;
    }) => {
      handlers.onContract(contract);
      handlers.onItem(item);
    },
  };
}

describe('publishPublicContractOffers', () => {
  it('publishes, keeps its state in R2 and never touches Firestore', async () => {
    const r2 = fakeR2();
    const ran = await publishPublicContractOffers({
      get: r2.get,
      put: r2.put,
      now: () => NOW,
      archive: archive('v1'),
    });
    expect(ran).toBe(true);
    const keys = [...r2.objects.keys()];
    expect(keys.some((k) => k.startsWith('contract-offers/'))).toBe(true);
    for (const key of [
      ARCHIVE_FINGERPRINT_R2_KEY,
      TYPE_HASHES_R2_KEY,
      OFFERS_STATE_R2_KEY,
      COURIERS_STATE_R2_KEY,
    ]) {
      expect(keys).toContain(key);
    }
    expect(JSON.parse(r2.objects.get(ARCHIVE_FINGERPRINT_R2_KEY) as string).fingerprint).toBe('v1');
  });

  it('skips when the archive fingerprint is unchanged', async () => {
    const r2 = fakeR2();
    const deps = { get: r2.get, put: r2.put, now: () => NOW };
    await publishPublicContractOffers({ ...deps, archive: archive('v1') });
    const before = new Map(r2.objects);
    const ran = await publishPublicContractOffers({ ...deps, archive: archive('v1') });
    expect(ran).toBe(false);
    expect(r2.objects).toEqual(before);
  });

  it('publishes again when the archive changed, re-uploading nothing that is unchanged', async () => {
    const r2 = fakeR2();
    const deps = { get: r2.get, put: r2.put, now: () => NOW };
    await publishPublicContractOffers({ ...deps, archive: archive('v1') });
    const puts: string[] = [];
    const ran = await publishPublicContractOffers({
      ...deps,
      put: async (key, body, headers) => {
        puts.push(key);
        await r2.put(key, body);
        void headers;
      },
      archive: archive('v2'),
    });
    expect(ran).toBe(true);
    expect(puts.filter((k) => /^contract-offers\/\d+/.test(k))).toEqual([]);
    expect(JSON.parse(r2.objects.get(ARCHIVE_FINGERPRINT_R2_KEY) as string).fingerprint).toBe('v2');
  });

  it('does not store the fingerprint when a publish failed, and throws', async () => {
    const r2 = fakeR2();
    await expect(
      publishPublicContractOffers({
        get: r2.get,
        put: async (key, body) => {
          if (key.startsWith('contract-offers/')) throw new Error('R2 down');
          await r2.put(key, body);
        },
        now: () => NOW,
        archive: archive('v1'),
      })
    ).rejects.toThrow();
    expect(r2.objects.has(ARCHIVE_FINGERPRINT_R2_KEY)).toBe(false);
  });

  it('still publishes when a state read fails', async () => {
    const r2 = fakeR2();
    const ran = await publishPublicContractOffers({
      get: async () => {
        throw new Error('R2 GET failed: 500');
      },
      put: r2.put,
      now: () => NOW,
      archive: archive('v1'),
    });
    expect(ran).toBe(true);
  });
});
