import { describe, expect, it } from 'vitest';
import { deriveAttributeBaseline } from '@/engine/attributeBaseline';
import type { CharacterAttributes } from '@/esi/endpoints';
import { attributeDiagnostics } from './attributeDiagnostics';

const attributes: CharacterAttributes = {
  intelligence: 38,
  memory: 34,
  perception: 40,
  willpower: 36,
  charisma: 31,
};

describe('attributeDiagnostics', () => {
  it('shows each attribute after implants so the one that breaks the sheet is visible', () => {
    const implants = { intelligence: 4, memory: 4, perception: 4, willpower: 4, charisma: 4 };
    const baseline = deriveAttributeBaseline({
      intelligence: 34,
      memory: 30,
      perception: 36,
      willpower: 32,
      charisma: 27,
    });
    const text = attributeDiagnostics({ attributes, implants, baseline });
    expect(baseline.kind).toBe('impossible');
    expect(text).toContain('Verdict: impossible');
    expect(text).toMatch(/After implants\s+34\s+30\s+36\s+32\s+27/);
    expect(text).toContain('After-implant total: 159');
    expect(text).toContain('excess 60, 12 per attribute');
    expect(text).toContain('Fetched: unknown');
  });
});
