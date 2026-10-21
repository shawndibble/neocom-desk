import { describe, expect, it } from 'vitest';
import { NAV_ICONS } from './navIcons';

describe('NAV_ICONS', () => {
  it('gives every nav page a glyph of its own', () => {
    const byIcon = new Map<unknown, string[]>();
    for (const [path, icon] of Object.entries(NAV_ICONS)) {
      byIcon.set(icon, [...(byIcon.get(icon) ?? []), path]);
    }
    const shared = [...byIcon.values()].filter((paths) => paths.length > 1);
    expect(shared).toEqual([]);
  });
});
