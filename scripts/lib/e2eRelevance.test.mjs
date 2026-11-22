import { describe, it, expect } from 'vitest';
import { needsBookE2e, needsBookE2eOnPr, needsE2e } from './e2eRelevance.mjs';

describe('needsE2e', () => {
  it('skips e2e when every change is docs, tooling config or backend-only', () => {
    expect(
      needsE2e([
        'docs/ARCHITECTURE.md',
        'GLOSSARY.md',
        'CLAUDE.md',
        '.claude/skills/triage/SKILL.md',
        'functions/src/index.ts',
        'rules-tests/orders.test.ts',
        'firestore.rules',
        '.github/workflows/cache-warm.yml',
        '.github/CODEOWNERS',
        'src/lib/foo.test.ts',
        'src/routes/Market.test.tsx',
      ])
    ).toBe(false);
  });

  it('runs e2e as soon as one file is app code', () => {
    expect(needsE2e(['docs/a.md', 'src/routes/Market.tsx'])).toBe(true);
    expect(needsE2e(['e2e/auth.spec.ts'])).toBe(true);
    expect(needsE2e(['public/icon.svg'])).toBe(true);
    expect(needsE2e(['index.html'])).toBe(true);
    expect(needsE2e(['package-lock.json'])).toBe(true);
    expect(needsE2e(['vite.config.ts'])).toBe(true);
    expect(needsE2e(['playwright.config.ts'])).toBe(true);
    expect(needsE2e(['src/i18n/locales/en.json'])).toBe(true);
  });

  it('runs e2e when the workflow that defines e2e changes, but not for other workflows', () => {
    expect(needsE2e(['.github/workflows/ci.yml'])).toBe(true);
    expect(needsE2e(['.github/workflows/deploy.yml'])).toBe(false);
  });

  it('runs e2e for files it does not know, so a new top-level path is never skipped by accident', () => {
    expect(needsE2e(['brand-new-dir/thing.ts'])).toBe(true);
    expect(needsE2e(['scripts/e2e-shard.mjs'])).toBe(true);
  });

  it('runs e2e when it was given no files, since an empty diff means the diff failed', () => {
    expect(needsE2e([])).toBe(true);
  });

  it('is not fooled by a doc-looking name inside app code', () => {
    expect(needsE2e(['src/features/README.md'])).toBe(true);
    expect(needsE2e(['src/docs/Guide.tsx'])).toBe(true);
  });

  it('counts a file moved out of app code as app code once the diff lists the source path', () => {
    // scripts/needs-e2e.mjs diffs with --no-renames, so a move shows as a
    // delete of the old path plus an add of the new one.
    expect(needsE2e(['src/features/x/Foo.tsx', 'docs/Foo.md'])).toBe(true);
  });
});

describe('needsBookE2e', () => {
  it('runs the Corp Tax Book specs for the backend they drive', () => {
    expect(needsBookE2e(['functions/src/corpTaxBookStore.ts'])).toBe(true);
    expect(needsBookE2e(['functions/package-lock.json'])).toBe(true);
    expect(needsBookE2e(['firestore.rules'])).toBe(true);
    expect(needsBookE2e(['firebase.json'])).toBe(true);
    expect(needsBookE2e(['e2e/corpTaxBookPayments.book.spec.ts'])).toBe(true);
    expect(needsBookE2e(['src/routes/CorpMoons.tsx'])).toBe(true);
  });

  it('skips them for what the e2e shards skip, bar the backend', () => {
    expect(
      needsBookE2e([
        'docs/ARCHITECTURE.md',
        'rules-tests/orders.test.ts',
        'functions/src/corpTaxBook.test.ts',
        '.github/workflows/cache-warm.yml',
        'src/routes/Market.test.tsx',
      ])
    ).toBe(false);
  });

  it('runs them when it was given no files', () => {
    expect(needsBookE2e([])).toBe(true);
  });
});

describe('needsBookE2eOnPr', () => {
  it('runs for the backend, the harness and tax, mining or moons code', () => {
    expect(needsBookE2eOnPr(['functions/src/corpTaxBook.ts'])).toBe(true);
    expect(needsBookE2eOnPr(['firestore.rules'])).toBe(true);
    expect(needsBookE2eOnPr(['e2e/corpTaxBookNotes.book.spec.ts'])).toBe(true);
    expect(needsBookE2eOnPr(['src/features/mining/MiningTaxPage.tsx'])).toBe(true);
    expect(needsBookE2eOnPr(['src/features/corp/moons/MoonsList.tsx'])).toBe(true);
  });

  it('skips unrelated app code, which the full run covers', () => {
    expect(needsBookE2eOnPr(['src/routes/Market.tsx', 'src/features/fittings/Fit.tsx'])).toBe(
      false
    );
  });

  it('skips unit tests even under a matching path', () => {
    expect(needsBookE2eOnPr(['src/features/mining/MiningTax.test.tsx'])).toBe(false);
    expect(needsBookE2eOnPr(['functions/src/corpTaxBook.test.ts'])).toBe(false);
  });

  it('runs when the diff failed', () => {
    expect(needsBookE2eOnPr([])).toBe(true);
  });
});
