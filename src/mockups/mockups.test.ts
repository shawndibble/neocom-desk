import { describe, expect, it } from 'vitest';

// Mockup stories are not part of the component catalogue: `!manifest` keeps
// them out of `/manifests/components.json` (docs/design/mockups/README.md).
const modules = import.meta.glob<{ default: { tags?: string[]; title?: string } }>(
  './*.stories.tsx',
  { eager: true }
);

describe('mockup stories', () => {
  it.each(Object.entries(modules))('%s is a mockups/ story tagged !manifest', (_file, mod) => {
    expect(mod.default.title).toMatch(/^mockups\//);
    expect(mod.default.tags).toContain('!manifest');
  });
});
