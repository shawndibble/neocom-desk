import { describe, expect, it } from 'vitest';
import { PRODUCT_RIG_SCOPES } from '../../src/engine/industry/rigScope.ts';
import {
  ALL_SHIPS_ATTRIBUTE,
  RIG_SCOPE_ATTRIBUTES,
  productRigScope,
  verifyRigScopeAttributes,
} from './rigScope.mjs';

const pinnedRows = () =>
  [...RIG_SCOPE_ATTRIBUTES, ALL_SHIPS_ATTRIBUTE].map((a) => ({
    attributeID: a.attributeID,
    description: a.description.replace(': ', ':\n').replaceAll(', ', ',    \n'),
  }));

describe('engine scope list', () => {
  it('matches the scopes the bake can produce', () => {
    expect([...PRODUCT_RIG_SCOPES].sort()).toEqual(RIG_SCOPE_ATTRIBUTES.map((a) => a.scope).sort());
  });
});

describe('verifyRigScopeAttributes', () => {
  it('accepts the pinned text through dogma whitespace noise', () => {
    expect(() => verifyRigScopeAttributes(pinnedRows())).not.toThrow();
  });
  it('fails loudly when a description changes', () => {
    const rows = pinnedRows();
    rows[0].description =
      'Decrease material requirement for manufacturing the following: Ship Modules';
    expect(() => verifyRigScopeAttributes(rows)).toThrow(/2538 description changed/);
  });
  it('fails loudly when an attribute disappears', () => {
    expect(() => verifyRigScopeAttributes(pinnedRows().slice(1))).toThrow(/2538 is missing/);
  });
});

describe('productRigScope', () => {
  it.each([
    ['T1 frigate', { categoryID: 6, groupID: 25 }, 'basSmall'],
    ['T2 interceptor', { categoryID: 6, groupID: 831, metaGroupID: 2 }, 'advSmall'],
    ['T1 cruiser', { categoryID: 6, groupID: 26 }, 'basMedium'],
    ['T3 cruiser', { categoryID: 6, groupID: 963, metaGroupID: 14 }, 'advMedium'],
    ['T3 subsystem', { categoryID: 32, groupID: 954, metaGroupID: 14 }, 'advMedium'],
    ['T1 battleship', { categoryID: 6, groupID: 27 }, 'basLarge'],
    ['jump freighter', { categoryID: 6, groupID: 902, metaGroupID: 2 }, 'advLarge'],
    ['dreadnought', { categoryID: 6, groupID: 485 }, 'capShip'],
    ['capital component', { categoryID: 17, groupID: 873 }, 'basCapComp'],
    ['T2 capital component', { categoryID: 17, groupID: 913 }, 'advCapComp'],
    ['T2 component', { categoryID: 17, groupID: 334 }, 'advComp'],
    ['module', { categoryID: 7, groupID: 60 }, 'equipment'],
    ['cargo container', { categoryID: 2, groupID: 12 }, 'equipment'],
    ['charge', { categoryID: 8, groupID: 83 }, 'ammo'],
    ['drone', { categoryID: 18, groupID: 100 }, 'drone'],
    ['fighter', { categoryID: 87, groupID: 1652 }, 'drone'],
    ['fuel block', { categoryID: 4, groupID: 1136 }, 'structure'],
    ['Upwell structure', { categoryID: 65, groupID: 1404 }, 'structure'],
  ])('%s', (_name, facts, scope) => {
    expect(productRigScope(facts)).toBe(scope);
  });
  it('leaves an unrelated product uncovered', () => {
    expect(productRigScope({ categoryID: 4, groupID: 18 })).toBeUndefined();
    expect(productRigScope({ categoryID: 6, groupID: 29 })).toBeUndefined();
  });
});
