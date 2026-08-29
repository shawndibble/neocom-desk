import { describe, it, expect } from 'vitest';
import { detectMode, previewClipboardImport, type ClipboardImportDeps } from './clipboardImport';
import type { UniverseType } from '@/esi/endpoints';

describe('detectMode', () => {
  it('detects an EFT fit by its "[Ship, Fit Name]" header', () => {
    expect(detectMode('[Rifter, My Fit]\nGyrostabilizer II')).toBe('eftFit');
  });

  it('tolerates leading blank lines before the header', () => {
    expect(detectMode('\n\n[Rifter, My Fit]')).toBe('eftFit');
  });

  it('detects a skill-plan paste otherwise', () => {
    expect(detectMode('Gunnery V\nSpaceship Command III')).toBe('skillPlan');
  });
});

describe('previewClipboardImport: skill plan paste', () => {
  const deps: ClipboardImportDeps = {
    skillByName: new Map([
      ['gunnery', { typeID: 1 }],
      ['spaceship command', { typeID: 2 }],
    ]),
    typeByName: new Map(),
    loadType: async () => null,
  };

  it('resolves known skill lines to entries', async () => {
    const preview = await previewClipboardImport('Gunnery V\nSpaceship Command III', deps);
    expect(preview.mode).toBe('skillPlan');
    expect(preview.entries).toEqual([
      { skillTypeID: 1, targetLevel: 5 },
      { skillTypeID: 2, targetLevel: 3 },
    ]);
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([]);
  });

  it('surfaces unrecognized lines as errors, one per bad line', async () => {
    const preview = await previewClipboardImport(
      'Gunnery V\nNot A Real Skill IV\nno level here',
      deps
    );
    expect(preview.entries).toEqual([{ skillTypeID: 1, targetLevel: 5 }]);
    expect(preview.errors).toEqual([
      { line: 2, text: 'Not A Real Skill IV', reason: 'unknown skill: Not A Real Skill' },
      {
        line: 3,
        text: 'no level here',
        reason: 'no skill level found (expected roman numeral I-V or 1-5)',
      },
    ]);
  });
});

describe('previewClipboardImport: EFT fit', () => {
  const RIFTER_TYPE_ID = 587;
  const MODULE_TYPE_ID = 2977;

  const typeByName = new Map([
    ['rifter', { typeID: RIFTER_TYPE_ID }],
    ['gyrostabilizer ii', { typeID: MODULE_TYPE_ID }],
  ]);

  function loadTypeFixture(dogmaByTypeId: Record<number, UniverseType['dogma_attributes']>) {
    return async (typeId: number) => {
      const dogma_attributes = dogmaByTypeId[typeId];
      if (!dogma_attributes) return null;
      return { data: { dogma_attributes } as UniverseType };
    };
  }

  it('resolves ship + module names, aggregating required skills into PlanEntry[]', async () => {
    const deps: ClipboardImportDeps = {
      skillByName: new Map(),
      typeByName,
      loadType: loadTypeFixture({
        [RIFTER_TYPE_ID]: [
          { attribute_id: 182, value: 3329 }, // Minmatar Frigate
          { attribute_id: 277, value: 1 },
        ],
        [MODULE_TYPE_ID]: [
          { attribute_id: 182, value: 3336 }, // Gunnery
          { attribute_id: 277, value: 3 },
        ],
      }),
    };

    const preview = await previewClipboardImport(
      '[Rifter, My Fit]\n\nGyrostabilizer II\n\n[Empty High slot]',
      deps
    );

    expect(preview.mode).toBe('eftFit');
    expect(preview.shipName).toBe('Rifter');
    expect(preview.entries).toEqual([
      { skillTypeID: 3329, targetLevel: 1 },
      { skillTypeID: 3336, targetLevel: 3 },
    ]);
    expect(preview.warnings).toEqual([]);
    expect(preview.errors).toEqual([]);
  });

  it('warns on unresolved item names without dropping resolvable ones', async () => {
    const deps: ClipboardImportDeps = {
      skillByName: new Map(),
      typeByName,
      loadType: loadTypeFixture({
        [RIFTER_TYPE_ID]: [
          { attribute_id: 182, value: 3329 },
          { attribute_id: 277, value: 1 },
        ],
      }),
    };

    const preview = await previewClipboardImport('[Rifter, My Fit]\nSome Unknown Module', deps);

    expect(preview.entries).toEqual([{ skillTypeID: 3329, targetLevel: 1 }]);
    expect(preview.warnings).toEqual(['Unknown item: Some Unknown Module']);
  });

  it('warns when a resolved type has no cached dogma data, without erroring', async () => {
    const deps: ClipboardImportDeps = {
      skillByName: new Map(),
      typeByName,
      loadType: async () => null, // nothing cached for either type
    };

    const preview = await previewClipboardImport('[Rifter, My Fit]\nGyrostabilizer II', deps);

    expect(preview.entries).toEqual([]);
    expect(preview.warnings).toEqual([
      `Requirements unknown for type #${RIFTER_TYPE_ID} (not cached — reconnect and retry)`,
      `Requirements unknown for type #${MODULE_TYPE_ID} (not cached — reconnect and retry)`,
    ]);
  });

  it('surfaces a bad header as a line error', async () => {
    const deps: ClipboardImportDeps = {
      skillByName: new Map(),
      typeByName: new Map(),
      loadType: async () => null,
    };
    // Starts with "[" (routes to EFT mode) but has no comma-separated fit name.
    const preview = await previewClipboardImport('[Rifter]\nGyrostabilizer II', deps);
    expect(preview.errors).toEqual([
      {
        line: 1,
        text: '[Rifter]',
        reason: 'invalid or missing fit header, expected "[Ship Name, Fit Name]"',
      },
    ]);
  });
});
