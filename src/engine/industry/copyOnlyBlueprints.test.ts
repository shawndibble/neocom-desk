import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COPY_ONLY_BLUEPRINT_TYPE_IDS,
  isCopyOnlyBlueprint,
} from '@/engine/industry/copyOnlyBlueprints';

describe('copy-only blueprints', () => {
  it('lists only published manufacturing blueprints from the baked SDE', () => {
    const blueprints = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'data', 'blueprints.json'), 'utf-8')
    ) as Record<string, { activity: string }>;
    for (const id of COPY_ONLY_BLUEPRINT_TYPE_IDS) {
      expect(blueprints[String(id)]?.activity, `blueprint ${id}`).toBe('manufacturing');
    }
  });

  it('recognises the listed ids and nothing else', () => {
    expect(isCopyOnlyBlueprint(33196)).toBe(true);
    expect(isCopyOnlyBlueprint(76376)).toBe(false);
  });
});
