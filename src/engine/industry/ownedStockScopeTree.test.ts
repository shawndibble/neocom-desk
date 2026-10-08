import { describe, expect, it } from 'vitest';
import {
  filterStockByScope,
  type DetectedOwnedStockMap,
  type OwnedStockPlacement,
} from './ownedStock';
import {
  buildScopeTree,
  isContainerChecked,
  isHangarChecked,
  stationState,
  toggleContainer,
  toggleHangar,
  toggleStation,
} from './ownedStockScopeTree';

const placement: OwnedStockPlacement = {
  characterId: 1,
  corporationId: 5,
  locationId: 60003760,
  locationType: 'station',
  quantity: 700,
  hangars: [
    { division: 1, quantity: 100 },
    { division: 2, quantity: 400 },
    { division: 3, quantity: 200 },
  ],
  containers: [{ containerId: 701, typeId: 3465, quantity: 400, hangar: 2 }],
};
const stock: DetectedOwnedStockMap = new Map([[34, { quantity: 700, placements: [placement] }]]);
const station = buildScopeTree(stock)[0]!;

describe('buildScopeTree', () => {
  it('nests hangars and containers under their station', () => {
    expect(station.hangars).toEqual([1, 2, 3]);
    expect(station.containers).toEqual([{ containerId: 701, typeId: 3465, hangar: 2 }]);
    expect(station.location.corporationId).toBe(5);
  });
});

describe('scope tree selection', () => {
  it('reads as empty with no scope', () => {
    expect(stationState(undefined, station)).toBe('empty');
  });

  it('toggling a station selects everything under it, and again clears it', () => {
    const whole = toggleStation(undefined, station);
    expect(stationState(whole, station)).toBe('checked');
    expect(isHangarChecked(whole, station, 3)).toBe(true);
    expect(stationState(toggleStation(whole, station), station)).toBe('empty');
  });

  it('a hangar alone makes the station partial and counts only that hangar', () => {
    const scope = toggleHangar(undefined, station, 3);
    expect(stationState(scope, station)).toBe('partial');
    expect(isHangarChecked(scope, station, 1)).toBe(false);
    expect(filterStockByScope(stock, scope).get(34)?.quantity).toBe(200);
  });

  it('a hangar check covers its containers', () => {
    const scope = toggleHangar(undefined, station, 2);
    expect(isContainerChecked(scope, station, station.containers[0]!)).toBe(true);
  });

  it('unchecking a hangar under a whole station keeps the other hangars', () => {
    const scope = toggleHangar(toggleStation(undefined, station), station, 3);
    expect(stationState(scope, station)).toBe('partial');
    expect(filterStockByScope(stock, scope).get(34)?.quantity).toBe(500);
  });

  it('unchecking a container under a whole station is a legacy exclusion', () => {
    const scope = toggleContainer(toggleStation(undefined, station), station, 701);
    expect(scope.excludedContainers).toEqual([701]);
    expect(stationState(scope, station)).toBe('partial');
    expect(filterStockByScope(stock, scope).get(34)?.quantity).toBe(300);
  });

  it('selecting every child one by one leaves the station partial until it is toggled whole', () => {
    let scope = toggleHangar(undefined, station, 1);
    scope = toggleHangar(scope, station, 2);
    scope = toggleHangar(scope, station, 3);
    expect(stationState(scope, station)).toBe('partial');
    expect(filterStockByScope(stock, scope).get(34)?.quantity).toBe(700);
  });

  it('toggles a lone container on and off', () => {
    const on = toggleContainer(undefined, station, 701);
    expect(filterStockByScope(stock, on).get(34)?.quantity).toBe(400);
    expect(toggleContainer(on, station, 701).containers).toBeUndefined();
  });
});
