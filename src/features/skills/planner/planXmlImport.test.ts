import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { previewPlanXmlImport } from './planXmlImport';

const FIXTURES = join(__dirname, '__fixtures__');

function fileFrom(name: string): File {
  return new File([readFileSync(join(FIXTURES, name))], name);
}

const CATALOG = new Map([
  ['gunnery', { typeID: 3300 }],
  ['spaceship command', { typeID: 3327 }],
  ['caldari frigate', { typeID: 3335 }],
]);

describe('previewPlanXmlImport', () => {
  it('round-trips a gzip .emp export (fixture matches the verified real EVEMon attribute-based plan schema) into plan entries', async () => {
    const preview = await previewPlanXmlImport(fileFrom('sample-plan.emp'), CATALOG);
    expect(preview.mode).toBe('planXml');
    expect(preview.planName).toBe('Sample Plan');
    expect(preview.errors).toEqual([]);
    expect(preview.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4, priority: 'normal' },
      { skillTypeID: 3327, targetLevel: 3, priority: 'high' },
      { skillTypeID: 3335, targetLevel: 5, priority: 'high' },
    ]);
  });

  it('round-trips the plain .xml variant identically', async () => {
    const preview = await previewPlanXmlImport(fileFrom('sample-plan.xml'), CATALOG);
    expect(preview.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 4, priority: 'normal' },
      { skillTypeID: 3327, targetLevel: 3, priority: 'high' },
      { skillTypeID: 3335, targetLevel: 5, priority: 'high' },
    ]);
  });

  it('surfaces an unknown skill as a per-entry error, not a throw', async () => {
    const preview = await previewPlanXmlImport(
      fileFrom('sample-plan.emp'),
      new Map([['gunnery', { typeID: 3300 }]])
    );
    expect(preview.entries).toEqual([{ skillTypeID: 3300, targetLevel: 4, priority: 'normal' }]);
    expect(preview.errors).toEqual([
      { line: 1, text: 'entry[1] "Spaceship Command"', reason: 'unknown skill: Spaceship Command' },
      { line: 2, text: 'entry[2] "Caldari Frigate"', reason: 'unknown skill: Caldari Frigate' },
    ]);
  });

  it('surfaces a file-level failure as documentErrorCode instead of throwing', async () => {
    const huge = new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'huge.emp');
    const preview = await previewPlanXmlImport(huge, CATALOG);
    expect(preview).toEqual({
      mode: 'planXml',
      entries: [],
      warnings: [],
      errors: [],
      documentErrorCode: 'tooLarge',
    });
  });
});
