import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { build, type Rollup } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import { groupModuleCode, localeSplitPlugin, prependGroupImports } from './localeSplitPlugin';

describe('prependGroupImports', () => {
  it('puts every import on the first line so no later line moves', () => {
    const code = "import x from 'y';\nt('market.title');\n";
    const out = prependGroupImports(code, ['g0', 'g3']);
    expect(out.split('\n')).toHaveLength(code.split('\n').length);
    expect(out).toBe('import "virtual:neocom-locale/g0";import "virtual:neocom-locale/g3";' + code);
  });
});

describe('groupModuleCode', () => {
  it('registers its keys through the registry', () => {
    expect(groupModuleCode({ market: { title: 'Market' } }, '/src/i18n/lazyResources.ts')).toBe(
      'import { addLazyResources } from "/src/i18n/lazyResources.ts";\n' +
        'addLazyResources({"market":{"title":"Market"}});'
    );
  });
});

describe('localeSplitPlugin in a real build', () => {
  const root = mkdtempSync(join(tmpdir(), 'locale-split-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  const files: Record<string, string> = {
    'index.html': '<script type="module" src="/src/main.ts"></script>',
    'src/i18n/locales/en.json': JSON.stringify({
      common: { save: 'SHELL_SAVE' },
      market: {
        title: 'SHELL_MARKET_TITLE',
        orders: { buy: 'ROUTE_ONLY_BUY' },
        unused: 'NAMED_BY_NOBODY',
      },
    }),
    'src/i18n/lazyResources.ts': readFileSync(join(__dirname, 'lazyResources.ts'), 'utf8'),
    'src/i18n/index.ts': [
      "import en from './locales/en.json';",
      "import { connectLazyResources } from './lazyResources';",
      'export const loaded: unknown[] = [en];',
      'connectLazyResources((r) => loaded.push(r));',
    ].join('\n'),
    'src/main.ts': [
      "import { loaded } from './i18n';",
      "console.log('market.title');",
      "void import('./route').then((m) => console.log(m.key));",
      'console.log(loaded);',
    ].join('\n'),
    'src/route.ts': "console.log('ROUTE_BODY_RUNS');\nexport const key = 'market.orders.buy';",
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }

  const chunks = (async () => {
    const result = (await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: { write: false, minify: false },
      plugins: [localeSplitPlugin()],
    })) as Rollup.RolldownOutput;
    return result.output.filter((o): o is Rollup.OutputChunk => o.type === 'chunk');
  })();

  it('keeps shell keys and keys nothing names in the entry, and moves route-only keys out', async () => {
    const all = await chunks;
    const entry = all.find((c) => c.isEntry)!;
    const route = all.find((c) => c.isDynamicEntry)!;
    expect(entry.code).toContain('SHELL_SAVE');
    expect(entry.code).toContain('SHELL_MARKET_TITLE');
    expect(entry.code).toContain('NAMED_BY_NOBODY');
    expect(entry.code).not.toContain('ROUTE_ONLY_BUY');
    expect(route.code).toContain('ROUTE_ONLY_BUY');
    expect(route.code).toContain('addLazyResources');
  });

  it("registers a route module's keys before that module's own body runs", async () => {
    const route = (await chunks).find((c) => c.isDynamicEntry)!;
    const registered = route.code.indexOf('ROUTE_ONLY_BUY');
    expect(registered).toBeGreaterThan(-1);
    expect(registered).toBeLessThan(route.code.indexOf('ROUTE_BODY_RUNS'));
  });
});
