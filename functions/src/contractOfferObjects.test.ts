import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildContractOfferR2Index,
  buildTypeObjects,
  gzipObjectBody,
  typeObjectName,
} from './contractOfferObjects.js';
import type { PublicContractOfferRow } from './publicContracts.js';

const row = (over: Partial<PublicContractOfferRow> = {}): PublicContractOfferRow => ({
  contractId: 1,
  regionId: 10000002,
  locationId: 60003760,
  typeId: 34,
  price: 100,
  isAuction: false,
  quantity: 1,
  dateExpired: 1_800_000_000_000,
  ...over,
});

describe('typeObjectName', () => {
  it('puts the content hash in the file name', () => {
    expect(typeObjectName(34, 'abc123')).toBe('contract-offers/types/34.abc123.json');
  });

  it('adds the region for a split part', () => {
    expect(typeObjectName(34, 'abc123', 10000002)).toBe(
      'contract-offers/types/34.r10000002.abc123.json'
    );
  });
});

describe('buildTypeObjects', () => {
  it('makes one object per type holding exactly that type’s rows', () => {
    const rows = [row(), row({ contractId: 2 }), row({ typeId: 35 })];
    const objects = buildTypeObjects(rows);
    expect(objects.map((o) => o.typeId).sort()).toEqual([34, 35]);
    const t34 = objects.find((o) => o.typeId === 34)!;
    expect(t34.parts).toHaveLength(1);
    expect(JSON.parse(t34.parts[0].body)).toHaveLength(2);
    expect(t34.parts[0].name).toBe(typeObjectName(34, t34.hash));
  });

  it('hash ignores row order and changes with content', () => {
    const a = buildTypeObjects([row({ contractId: 1 }), row({ contractId: 2 })])[0];
    const b = buildTypeObjects([row({ contractId: 2 }), row({ contractId: 1 })])[0];
    const c = buildTypeObjects([row({ contractId: 1, price: 5 }), row({ contractId: 2 })])[0];
    expect(b.hash).toBe(a.hash);
    expect(c.hash).not.toBe(a.hash);
  });

  it('splits an oversized type by region and every row lands in exactly one part', () => {
    const rows = [
      row({ contractId: 1, regionId: 1 }),
      row({ contractId: 2, regionId: 1 }),
      row({ contractId: 3, regionId: 2 }),
    ];
    const [obj] = buildTypeObjects(rows, { maxObjectBytes: 10 });
    expect(obj.parts.map((p) => p.regionId)).toEqual([1, 2]);
    expect(obj.parts.map((p) => JSON.parse(p.body).length)).toEqual([2, 1]);
    expect(obj.parts[0].name).toBe(typeObjectName(34, obj.hash, 1));
  });

  it('keeps a small type whole', () => {
    const [obj] = buildTypeObjects([row({ regionId: 1 }), row({ contractId: 2, regionId: 2 })]);
    expect(obj.parts).toHaveLength(1);
    expect(obj.parts[0].regionId).toBeUndefined();
  });
});

describe('gzipObjectBody', () => {
  it('round-trips', () => {
    expect(gunzipSync(gzipObjectBody('[1,2]')).toString()).toBe('[1,2]');
  });
});

describe('buildContractOfferR2Index', () => {
  it('lists count, cheapest, object names and regions per type', () => {
    const rows = [
      row({ price: 300 }),
      row({ contractId: 2, price: 200, regionId: 10000043 }),
      row({ typeId: 35, price: 0 }),
    ];
    const objects = buildTypeObjects(rows);
    const index = buildContractOfferR2Index(rows, objects, 12345);
    expect(index.lastSyncedAt).toBe(12345);
    expect(index.regionIds).toEqual([10000002, 10000043]);
    const t34 = objects.find((o) => o.typeId === 34)!;
    expect(index.types['34']).toEqual({
      count: 2,
      cheapest: 200,
      objects: [t34.parts[0].name],
    });
    expect(index.types['35'].cheapest).toBeNull();
  });
});
