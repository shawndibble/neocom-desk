import { describe, it, expect } from 'vitest';
import {
  isLayoutSpec,
  needsFullUnitRun,
  parseVitestListFiles,
  shardCount,
  shardMatrix,
} from './ciPlan.mjs';

describe('isLayoutSpec', () => {
  it('flags geometry specs and leaves behaviour specs on the PR', () => {
    expect(isLayoutSpec('e2e/marketOrderBookNarrow.spec.ts')).toBe(true);
    expect(isLayoutSpec('e2e/inlineControlHeights.spec.ts')).toBe(true);
    expect(isLayoutSpec('e2e/fittingsRingSticky.spec.ts')).toBe(true);
    expect(isLayoutSpec('e2e/coreOnlyCharacterSweep.spec.ts')).toBe(false);
    expect(isLayoutSpec('e2e/auth.spec.ts')).toBe(false);
    expect(isLayoutSpec('e2e/piEsiError.spec.ts')).toBe(false);
  });

  it('reads the file name, not a directory that happens to match', () => {
    expect(isLayoutSpec('narrow-screens/auth.spec.ts')).toBe(false);
  });
});

describe('shardCount', () => {
  const weights = { 'a.ts': 100, 'b.ts': 100, 'c.ts': 100 };
  it('is 0 when there is nothing to run', () => {
    expect(shardCount([], weights, 300, 4)).toBe(0);
  });
  it('is at least 1 and at most max', () => {
    expect(shardCount(['a.ts'], weights, 300, 4)).toBe(1);
    expect(shardCount(['a.ts', 'b.ts', 'c.ts'], weights, 100, 2)).toBe(2);
  });
  it('rounds up so no shard is over target', () => {
    expect(shardCount(['a.ts', 'b.ts', 'c.ts'], weights, 150, 4)).toBe(2);
  });
  it('counts an unmeasured file as the median', () => {
    expect(shardCount(['new.ts', 'newer.ts'], weights, 100, 4)).toBe(2);
  });
  it('never plans a shard with no file to run', () => {
    expect(shardCount(['a.ts'], weights, 10, 4)).toBe(1);
  });
});

describe('shardMatrix', () => {
  it('lists shard numbers', () => {
    expect(shardMatrix(3)).toBe('[1,2,3]');
    expect(shardMatrix(0)).toBe('[]');
  });
});

describe('needsFullUnitRun', () => {
  it('stays narrow for app code and tests', () => {
    expect(needsFullUnitRun(['src/routes/Assets.tsx', 'src/routes/Assets.test.tsx'])).toBe(false);
  });
  it('goes full for dependencies, config, test support and the CI plan', () => {
    for (const file of [
      'package-lock.json',
      'vite.config.ts',
      'vitest.setup.dom.ts',
      'tsconfig.base.json',
      'src/test/renderPage.tsx',
      'scripts/lib/ciPlan.mjs',
      '.github/workflows/ci.yml',
    ]) {
      expect(needsFullUnitRun(['src/a.ts', file]), file).toBe(true);
    }
  });
  it('goes full when the diff failed', () => {
    expect(needsFullUnitRun([])).toBe(true);
  });
});

describe('parseVitestListFiles', () => {
  it('strips the project prefix and de-duplicates', () => {
    const out = [
      '[dom] src/routes/Assets.test.tsx',
      '[unit] src/lib/age.test.ts',
      '[dom] src/routes/Assets.test.tsx',
      '',
      'some other line',
    ].join('\n');
    expect(parseVitestListFiles(out)).toEqual([
      'src/lib/age.test.ts',
      'src/routes/Assets.test.tsx',
    ]);
  });
});
