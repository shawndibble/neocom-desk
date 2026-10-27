import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  buildBundleObjects,
  buildContractOfferR2Index,
  buildTypeObjects,
  bundleObjectName,
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

describe('bundleObjectName', () => {
  it('names the group, the shard and the content hash', () => {
    expect(bundleObjectName('blueprints', 0, 'abc123')).toBe(
      'contract-offers/bundles/blueprints.0.abc123.json'
    );
  });
});

describe('buildBundleObjects', () => {
  const bpc = (over: Partial<PublicContractOfferRow> = {}) =>
    row({ typeId: 999, isBlueprintCopy: true, me: 10, te: 20, runs: 5, ...over });
  const parse = (bodies: { body: string }[]) => bodies.flatMap((b) => JSON.parse(b.body));

  it('puts every row of a blueprint type in the blueprints group, the rest in others', () => {
    const rows = [
      row(),
      bpc(),
      // A BPO: no copy flag, but ME/TE make the type a blueprint.
      row({ contractId: 2, typeId: 1000, me: 0, te: 0 }),
      // Same blueprint type without ME/TE still rides with its type.
      row({ contractId: 3, typeId: 999 }),
      row({ contractId: 4, typeId: 35 }),
    ];
    const bundles = buildBundleObjects(buildTypeObjects(rows), rows);
    expect(
      parse(bundles.blueprints)
        .map((r) => r.typeId)
        .sort()
    ).toEqual([1000, 999, 999]);
    expect(
      parse(bundles.others)
        .map((r) => r.typeId)
        .sort()
    ).toEqual([34, 35]);
  });

  it('keeps every row exactly once across shards', () => {
    const rows = Array.from({ length: 30 }, (_, i) => row({ contractId: i, typeId: 100 + i }));
    const bundles = buildBundleObjects(buildTypeObjects(rows), rows, { maxBundleBytes: 500 });
    expect(bundles.others.length).toBeGreaterThan(1);
    expect(
      parse(bundles.others)
        .map((r) => r.contractId)
        .sort((a, b) => a - b)
    ).toEqual(rows.map((r) => r.contractId));
    expect(bundles.blueprints).toEqual([]);
    bundles.others.forEach((part, shard) =>
      expect(part.name).toMatch(
        new RegExp(`^contract-offers/bundles/others\\.${shard}\\.\\w+\\.json$`)
      )
    );
  });

  it('names shards by content, independent of row order', () => {
    const rows = [row(), row({ contractId: 2, typeId: 35 })];
    const reversed = [...rows].reverse();
    const a = buildBundleObjects(buildTypeObjects(rows), rows);
    const b = buildBundleObjects(buildTypeObjects(reversed), reversed);
    expect(b.others.map((p) => p.name)).toEqual(a.others.map((p) => p.name));
    const changed = [row({ price: 5 }), rows[1]];
    const c = buildBundleObjects(buildTypeObjects(changed), changed);
    expect(c.others[0].name).not.toBe(a.others[0].name);
  });

  it('includes the rows of a type split by region', () => {
    const rows = [row({ regionId: 1 }), row({ contractId: 2, regionId: 2 })];
    const objects = buildTypeObjects(rows, { maxObjectBytes: 10 });
    expect(parse(buildBundleObjects(objects, rows).others)).toHaveLength(2);
  });
});

describe('buildContractOfferR2Index bundles', () => {
  it('names the bundle shards when given them', () => {
    const rows = [row()];
    const objects = buildTypeObjects(rows);
    const bundles = buildBundleObjects(objects, rows);
    const index = buildContractOfferR2Index(rows, objects, 1, bundles);
    expect(index.bundles).toEqual({
      blueprints: [],
      others: bundles.others.map((p) => p.name),
    });
  });

  it('leaves bundles out when not given them', () => {
    const rows = [row()];
    expect(buildContractOfferR2Index(rows, buildTypeObjects(rows), 1).bundles).toBeUndefined();
  });
});
