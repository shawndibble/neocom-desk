import { describe, it, expect } from 'vitest';
import {
  parseMarketParams,
  buildMarketParams,
  buildMarketGroupParams,
  resolveAgainstCatalogue,
  resolveMarketLocation,
  marketLinkParams,
  type MarketLocationParam,
} from './urlState';

describe('parseMarketParams', () => {
  function paramsOf(values: Record<string, string>) {
    return (key: string) => values[key] ?? null;
  }

  it('parses a valid type, hub and region', () => {
    expect(parseMarketParams(paramsOf({ type: '587', hub: 'jita', region: '10000002' }))).toEqual({
      typeId: 587,
      hubId: 'jita',
      regionId: 10000002,
      groupId: null,
    });
  });

  it('returns nulls when params are absent', () => {
    expect(parseMarketParams(paramsOf({}))).toEqual({
      typeId: null,
      hubId: null,
      regionId: null,
      groupId: null,
    });
  });

  it('rejects a non-numeric type or region as malformed', () => {
    expect(parseMarketParams(paramsOf({ type: 'abc', region: 'xyz' }))).toEqual({
      typeId: null,
      hubId: null,
      regionId: null,
      groupId: null,
    });
  });

  it('rejects a negative or zero type id', () => {
    expect(parseMarketParams(paramsOf({ type: '-1' })).typeId).toBeNull();
    expect(parseMarketParams(paramsOf({ type: '0' })).typeId).toBeNull();
  });

  it('treats an empty hub param as absent', () => {
    expect(parseMarketParams(paramsOf({ hub: '' })).hubId).toBeNull();
  });

  it('parses a valid group id', () => {
    expect(parseMarketParams(paramsOf({ group: '618' })).groupId).toBe(618);
  });

  it('rejects a non-numeric or non-positive group id', () => {
    expect(parseMarketParams(paramsOf({ group: 'abc' })).groupId).toBeNull();
    expect(parseMarketParams(paramsOf({ group: '0' })).groupId).toBeNull();
  });
});

describe('buildMarketGroupParams', () => {
  it('builds a bare group param', () => {
    expect(buildMarketGroupParams(618)).toEqual({ group: '618' });
  });
});

describe('buildMarketParams', () => {
  it('omits the type key when no item is selected', () => {
    expect(buildMarketParams(null, { mode: 'hub', hubId: 'jita' })).toEqual({ hub: 'jita' });
  });

  it('includes type alongside a hub location', () => {
    expect(buildMarketParams(587, { mode: 'hub', hubId: 'jita' })).toEqual({
      type: '587',
      hub: 'jita',
    });
  });

  it('includes type alongside a region location', () => {
    expect(buildMarketParams(587, { mode: 'region', regionId: 10000002 })).toEqual({
      type: '587',
      region: '10000002',
    });
  });
});

describe('resolveAgainstCatalogue', () => {
  interface Item {
    id: number;
  }
  const matches = (item: Item, id: number) => item.id === id;

  it('is false when no id was parsed', () => {
    expect(resolveAgainstCatalogue<Item>(null, [{ id: 1 }], matches)).toBe(false);
  });

  it('is optimistically true while the catalogue has not loaded yet', () => {
    expect(resolveAgainstCatalogue<Item>(1, null, matches)).toBe(true);
  });

  it('is true once the id is found in a loaded catalogue', () => {
    expect(resolveAgainstCatalogue<Item>(1, [{ id: 1 }, { id: 2 }], matches)).toBe(true);
  });

  it('is false once the catalogue has loaded and does not contain the id', () => {
    expect(resolveAgainstCatalogue<Item>(99, [{ id: 1 }, { id: 2 }], matches)).toBe(false);
  });
});

describe('resolveMarketLocation', () => {
  const fallback: MarketLocationParam = { mode: 'hub', hubId: 'jita' };

  it('prefers a valid region param over everything else', () => {
    expect(
      resolveMarketLocation(
        { regionId: 10000043, hubId: 'amarr' },
        { region: true, hub: true },
        fallback
      )
    ).toEqual({ mode: 'region', regionId: 10000043 });
  });

  it('falls back to a valid hub param when the region is absent or invalid', () => {
    expect(
      resolveMarketLocation(
        { regionId: null, hubId: 'amarr' },
        { region: false, hub: true },
        fallback
      )
    ).toEqual({ mode: 'hub', hubId: 'amarr' });
  });

  it('ignores an invalid region even when a region id was parsed', () => {
    expect(
      resolveMarketLocation(
        { regionId: 999, hubId: 'amarr' },
        { region: false, hub: true },
        fallback
      )
    ).toEqual({ mode: 'hub', hubId: 'amarr' });
  });

  it('falls back to the device-local default when neither param resolves', () => {
    expect(
      resolveMarketLocation(
        { regionId: null, hubId: null },
        { region: false, hub: false },
        fallback
      )
    ).toBe(fallback);
  });
});

describe('marketLinkParams', () => {
  // Shared by ItemContextMenu's "View in Market" and ImplantChip's Market
  // link (#405): preserve whatever region/hub the current page is already
  // scoped to, so a link from inside /market carries that scope over rather
  // than resetting to the device's Location Mode default.
  it('preserves an existing region param', () => {
    expect(marketLinkParams(587, '?region=10000002')).toEqual({
      type: '587',
      region: '10000002',
    });
  });

  it('preserves an existing hub param when there is no region', () => {
    expect(marketLinkParams(587, '?hub=jita')).toEqual({ type: '587', hub: 'jita' });
  });

  it('prefers region over hub when both are present', () => {
    expect(marketLinkParams(587, '?region=10000002&hub=jita')).toEqual({
      type: '587',
      region: '10000002',
    });
  });

  it('falls back to just the typeId when arriving with neither param (e.g. from Skills)', () => {
    expect(marketLinkParams(587, '')).toEqual({ type: '587' });
  });
});
