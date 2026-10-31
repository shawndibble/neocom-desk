import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COVERT_CLOAK_EFFECT } from '@/engine/fittings/explore';

// Drift guard: the committed file is what `scripts/lib/typeEffects.mjs` bakes.
const read = <T>(name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', name), 'utf-8')) as T;
const idOf = (name: string) =>
  Number(
    Object.entries(read<Record<string, { name: string }>>('types.json')).find(
      ([, type]) => type.name === name
    )?.[0]
  );

describe('committed typeEffects.json', () => {
  const effects = read<Record<string, number[]>>('typeEffects.json');

  it('puts Covert Ops Cloaking Device II under cloakingWarpSafe, and a Prototype cloak not', () => {
    const covert = effects[COVERT_CLOAK_EFFECT] ?? [];
    expect(covert).toContain(idOf('Covert Ops Cloaking Device II'));
    expect(covert).not.toContain(idOf('Prototype Cloaking Device I'));
  });

  it('lists ids sorted', () => {
    for (const ids of Object.values(effects)) expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });
});
