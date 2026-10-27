import { describe, it, expect } from 'vitest';
import { craftScope, reactionCraftEligible } from '@/engine/industry/craftScope';

describe('reactionCraftEligible', () => {
  it('is false for a manufacturing-activity plan with Include Reactions off', () => {
    expect(reactionCraftEligible('manufacturing', false)).toBe(false);
  });

  it('is true for a manufacturing-activity plan with Include Reactions on', () => {
    expect(reactionCraftEligible('manufacturing', true)).toBe(true);
  });

  it('is true for a reaction-activity plan regardless of Include Reactions — it reuses its own facility', () => {
    expect(reactionCraftEligible('reaction', false)).toBe(true);
    expect(reactionCraftEligible('reaction', true)).toBe(true);
  });
});

describe('craftScope', () => {
  it('is manufacturing-only when reactions are not eligible', () => {
    expect(craftScope('manufacturing', false)).toEqual(['manufacturing']);
  });

  it('adds reaction when Include Reactions is on', () => {
    expect(craftScope('manufacturing', true)).toEqual(['manufacturing', 'reaction']);
  });

  it('adds reaction for a reaction-activity plan even with the flag off', () => {
    expect(craftScope('reaction', false)).toEqual(['manufacturing', 'reaction']);
  });

  it('never includes planetary — out of scope for issue #698', () => {
    expect(craftScope('manufacturing', true)).not.toContain('planetary');
  });
});
