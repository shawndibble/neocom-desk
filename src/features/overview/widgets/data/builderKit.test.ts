import { describe, expect, it } from 'vitest';
import { blank, byShow, type Builder } from './builderKit';
import type { BuildContext } from './types';

const ctx = (show?: BuildContext['show']): BuildContext => ({
  t: (k) => k,
  now: 0,
  activeCharacterId: null,
  scopeAll: false,
  notTrainingAlert: false,
  range: 30,
  show,
});
const named =
  (summary: string): Builder =>
  () => ({ ...blank(null, {} as never), summary });

describe('byShow', () => {
  it("builds the Show's own builder, and the fallback for a Show it has none for", () => {
    const build = byShow({ flow: named('flow') }, named('fallback'));
    expect(build({}, ctx('flow')).summary).toBe('flow');
    expect(build({}, ctx('sources')).summary).toBe('fallback');
    expect(build({}, ctx()).summary).toBe('fallback');
  });
});
