import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAst } from 'vite';
import { describe, expect, it } from 'vitest';
import { ALLOWED_ICON_WEIGHTS } from './iconWeights';
import { isPhosphorDefsId, stripPhosphorWeights } from './phosphorWeightsPlugin';

const entry = (weight: string, d: string) =>
  `  [\n    "${weight}",\n    /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement("path", { d: "${d}" }))\n  ]`;

/** The shape of `@phosphor-icons/react/dist/defs/Check.es.js` (v2.1.x), paths shortened. */
const SNIPPET = [
  'import * as e from "react";',
  'const a = /* @__PURE__ */ new Map([',
  [
    entry('bold', 'M1'),
    // duotone spans several lines and nests its own `[`/`{`.
    `  [\n    "duotone",\n    /* @__PURE__ */ e.createElement(e.Fragment, null, /* @__PURE__ */ e.createElement(\n      "path",\n      {\n        d: "M2",\n        opacity: "0.2"\n      }\n    ))\n  ]`,
    entry('fill', 'M3'),
    entry('light', 'M4'),
    entry('regular', 'M5'),
    entry('thin', 'M6'),
  ].join(',\n'),
  ']);',
  'export {',
  '  a as default',
  '};',
  '',
].join('\n');

const weightsOf = (code: string) => [...code.matchAll(/^ {4}"([a-z]+)",$/gm)].map((m) => m[1]);

describe('stripPhosphorWeights', () => {
  it('keeps only the allowed weights and leaves the module around them intact', () => {
    const out = stripPhosphorWeights(SNIPPET, ['light', 'fill']);
    expect(weightsOf(out)).toEqual(['fill', 'light']);
    expect(out).toContain('d: "M3"');
    expect(out).toContain('d: "M4"');
    expect(out).not.toMatch(/M1|M2|M5|M6/);
    expect(
      out.startsWith('import * as e from "react";\nconst a = /* @__PURE__ */ new Map([\n')
    ).toBe(true);
    expect(out.endsWith(']);\nexport {\n  a as default\n};\n')).toBe(true);
    expect(() => parseAst(out)).not.toThrow();
  });

  it('handles CRLF line endings', () => {
    const out = stripPhosphorWeights(SNIPPET.replace(/\n/g, '\r\n'), ['light']);
    expect(out).toContain('"light"');
    expect(out).not.toContain('"fill"');
    expect(() => parseAst(out)).not.toThrow();
  });

  it('fails loudly when the defs format drifts', () => {
    expect(() =>
      stripPhosphorWeights(SNIPPET.replace(entry('thin', 'M6'), entry('hair', 'M6')))
    ).toThrow(/expected weights/);
    expect(() => stripPhosphorWeights(SNIPPET.replace(',\n' + entry('thin', 'M6'), ''))).toThrow(
      /found bold\/duotone\/fill\/light\/regular$/
    );
    expect(() => stripPhosphorWeights('export default new Set();')).toThrow(/new Map/);
    expect(() => stripPhosphorWeights(SNIPPET.replace(']);', '], extra);'))).toThrow();
  });
});

describe('isPhosphorDefsId', () => {
  it('matches defs modules only, on either path separator, with or without a query', () => {
    expect(isPhosphorDefsId('/x/node_modules/@phosphor-icons/react/dist/defs/Check.es.js')).toBe(
      true
    );
    expect(
      isPhosphorDefsId('C:\\x\\node_modules\\@phosphor-icons\\react\\dist\\defs\\Check.es.js')
    ).toBe(true);
    expect(
      isPhosphorDefsId('/x/node_modules/@phosphor-icons/react/dist/defs/Check.es.js?v=1')
    ).toBe(true);
    expect(isPhosphorDefsId('/x/node_modules/@phosphor-icons/react/dist/csr/Check.es.js')).toBe(
      false
    );
    expect(isPhosphorDefsId('/x/node_modules/@phosphor-icons/react/dist/lib/IconBase.es.js')).toBe(
      false
    );
  });
});

describe('every installed Phosphor defs module', () => {
  const defsDir = join(
    __dirname,
    '..',
    '..',
    '..',
    'node_modules',
    '@phosphor-icons',
    'react',
    'dist',
    'defs'
  );
  const files = readdirSync(defsDir).filter((f) => f.endsWith('.es.js'));

  it('strips cleanly to exactly the allowed weights', () => {
    expect(files.length).toBeGreaterThan(1000);
    for (const file of files) {
      const out = stripPhosphorWeights(
        readFileSync(join(defsDir, file), 'utf8'),
        ALLOWED_ICON_WEIGHTS,
        file
      );
      expect(weightsOf(out).sort(), file).toEqual([...ALLOWED_ICON_WEIGHTS].sort());
      expect(() => parseAst(out), file).not.toThrow();
    }
  });
});
