import { describe, it, expect } from 'vitest';
import { needsTests } from './testRelevance.mjs';

describe('needsTests', () => {
  it('skips the tests when every change is prose', () => {
    expect(
      needsTests([
        'docs/ARCHITECTURE.md',
        'GLOSSARY.md',
        'CLAUDE.md',
        '.claude/skills/add-missing-features/TOOLS.md',
        '.out-of-scope/blueprint-job-planning.md',
        'docs/context/decisions/20261025-000000-x.md',
      ])
    ).toBe(false);
  });

  it('runs the tests as soon as one file is code, config or a test', () => {
    expect(needsTests(['docs/a.md', 'src/routes/Market.tsx'])).toBe(true);
    expect(needsTests(['src/lib/foo.test.ts'])).toBe(true);
    expect(needsTests(['functions/src/index.ts'])).toBe(true);
    expect(needsTests(['.github/workflows/ci.yml'])).toBe(true);
    expect(needsTests(['package-lock.json'])).toBe(true);
    expect(needsTests(['scripts/needs-tests.mjs'])).toBe(true);
  });

  it('runs the tests for nested Markdown outside the safe directories', () => {
    expect(needsTests(['src/features/industry/README.md'])).toBe(true);
  });

  it('runs the tests when the diff failed or is empty', () => {
    expect(needsTests([])).toBe(true);
  });

  it('runs the tests for files it does not know', () => {
    expect(needsTests(['brand-new-dir/thing.ts'])).toBe(true);
  });
});
