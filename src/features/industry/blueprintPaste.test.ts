import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import type { BlueprintCatalog, BlueprintCatalogEntry } from './blueprintCatalog';
import { findGroupOfBlueprints, previewBlueprintPaste } from './blueprintPaste';

function entry(id: number, name: string): BlueprintCatalogEntry {
  return {
    blueprintTypeID: id,
    blueprint: { name } as BlueprintCatalogEntry['blueprint'],
    productTypeID: id + 1,
    productName: name.replace(' Blueprint', ''),
    productNameLower: name.toLowerCase(),
  };
}

const CATALOG = {
  entries: [entry(1, 'Rifter Blueprint'), entry(3, 'Merlin Blueprint')],
} as unknown as BlueprintCatalog;
const NAMES = new Set(['rifter blueprint', 'merlin blueprint', 'rifter ii invention blueprint']);

describe('previewBlueprintPaste', () => {
  it('keeps buildable blueprints once and counts the rest as skipped', () => {
    const text = [
      'Rifter Blueprint',
      'Rifter Blueprint (Copy)',
      'Merlin Blueprint',
      'Rifter II Invention Blueprint',
    ].join('\n');
    const preview = previewBlueprintPaste(text, CATALOG, NAMES);
    expect(preview.entries.map((e) => e.blueprintTypeID)).toEqual([1, 3]);
    expect(preview.skipped).toBe(1);
  });
});

describe('findGroupOfBlueprints', () => {
  const groups = { 7: [{ id: 'g', name: 'Pasted', order: 0 }] };
  const plan = (blueprintTypeID: number, buildGroupId: string | undefined) =>
    ({ blueprintTypeID, buildGroupId }) as BuildPlanRecord;

  it('finds the group covering exactly the same blueprints', () => {
    expect(findGroupOfBlueprints(groups, [plan(1, 'g'), plan(3, 'g')], 7, [3, 1])).toBe('g');
  });

  it('ignores a group that has since grown, shrunk or differs', () => {
    expect(findGroupOfBlueprints(groups, [plan(1, 'g')], 7, [1, 3])).toBeNull();
    expect(findGroupOfBlueprints(groups, [plan(1, 'g'), plan(3, 'g')], 7, [1])).toBeNull();
    expect(findGroupOfBlueprints(groups, [plan(1, 'g'), plan(5, 'g')], 7, [1, 3])).toBeNull();
    expect(findGroupOfBlueprints(groups, [plan(1, undefined)], 7, [1])).toBeNull();
  });
});
