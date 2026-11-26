import type { Plugin } from 'vite';
import { ALLOWED_ICON_WEIGHTS, PHOSPHOR_WEIGHTS } from './iconWeights.ts';

const DEFS_ID = /[\\/]@phosphor-icons[\\/]react[\\/]dist[\\/]defs[\\/][^\\/?]+\.es\.js(?:\?.*)?$/;

const ENTRY = /^ {2}\[\r?\n {4}"([a-z]+)",\r?\n[\s\S]*?^ {2}\]/gm;

const MAP_OPEN = 'new Map([';
const MAP_CLOSE = /\r?\n\]\);/;

export function isPhosphorDefsId(id: string): boolean {
  return DEFS_ID.test(id);
}

export function stripPhosphorWeights(
  code: string,
  allowed: readonly string[] = ALLOWED_ICON_WEIGHTS,
  id = 'phosphor defs module'
): string {
  const fail = (why: string): never => {
    throw new Error(`[neocom-phosphor-weights] ${id}: ${why}`);
  };
  const open = code.indexOf(MAP_OPEN);
  if (open === -1 || code.indexOf(MAP_OPEN, open + 1) !== -1)
    fail('expected exactly one `new Map([`');
  const bodyStart = open + MAP_OPEN.length;
  const close = MAP_CLOSE.exec(code.slice(bodyStart));
  if (!close) fail('no closing `]);` for the weights Map');
  const bodyEnd = bodyStart + close!.index;
  const body = code.slice(bodyStart, bodyEnd);

  const entries = [...body.matchAll(ENTRY)].map((m) => ({ weight: m[1], text: m[0] }));
  const found = entries.map((e) => e.weight).sort();
  if (found.join() !== [...PHOSPHOR_WEIGHTS].sort().join()) {
    fail(`expected weights ${PHOSPHOR_WEIGHTS.join('/')}, found ${found.join('/') || 'none'}`);
  }
  if (body.replace(ENTRY, '').replace(/[\s,]/g, '') !== '') {
    fail('weights Map holds something besides the six weight entries');
  }

  const kept = entries.filter((e) => allowed.includes(e.weight)).map((e) => e.text);
  const eol = close![0].startsWith('\r') ? '\r\n' : '\n';
  return code.slice(0, bodyStart) + eol + kept.join(`,${eol}`) + code.slice(bodyEnd);
}

export function phosphorWeightsPlugin(allowed: readonly string[] = ALLOWED_ICON_WEIGHTS): Plugin {
  return {
    name: 'neocom-phosphor-weights',
    apply: 'build',
    enforce: 'pre',
    transform: {
      filter: { id: DEFS_ID },
      handler(code, id) {
        if (!isPhosphorDefsId(id)) return null;
        return { code: stripPhosphorWeights(code, allowed, id), map: null };
      },
    },
  };
}
