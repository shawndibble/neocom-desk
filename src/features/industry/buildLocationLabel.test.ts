import { describe, it, expect } from 'vitest';
import { buildLocationLabel } from './buildLocationLabel';

const t = (key: string, opts?: Record<string, unknown>) =>
  `${key}:${opts?.facility}:${opts?.system}`;

describe('buildLocationLabel', () => {
  it("uses the place's own name when ESI gave one", () => {
    expect(buildLocationLabel('K2-18 R&D', 'azbel', 'Badivefi', t)).toBe('K2-18 R&D');
  });

  it('says what and where when ESI withheld the name', () => {
    expect(buildLocationLabel(null, 'azbel', 'Badivefi', t)).toBe(
      'industry.buildLocationUnnamed:Azbel:Badivefi'
    );
  });

  it('names the facility from its preset rather than the raw kind', () => {
    expect(buildLocationLabel(null, 'npcStation', 'Jita', t)).toBe(
      'industry.buildLocationUnnamed:NPC station:Jita'
    );
  });
});
