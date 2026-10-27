import { describe, expect, it } from 'vitest';
import { planReactionLocation } from './planReactionLocation';

const base = {
  facility: 'npcStation' as const,
  security: 'highsec' as const,
  includeReactions: true,
};

describe('planReactionLocation', () => {
  it('is null for a plan with no reactions', () => {
    expect(planReactionLocation({ ...base, includeReactions: false }, 'manufacturing')).toBeNull();
  });

  it('flags a chosen highsec Reaction Location', () => {
    const loc = planReactionLocation(
      {
        ...base,
        reactionBuildSystemId: 1,
        reactionBuildSystemName: 'Jita',
        reactionSecurity: 'highsec',
      },
      'manufacturing'
    );
    expect(loc?.state).toBe('highsec');
  });

  it('treats no Reaction Location as unset, not highsec', () => {
    expect(planReactionLocation(base, 'manufacturing')?.state).toBe('unset');
  });

  it('accepts a lowsec Reaction Location', () => {
    const loc = planReactionLocation(
      {
        ...base,
        reactionBuildSystemId: 2,
        reactionBuildSystemName: 'Tama',
        reactionSecurity: 'lowsec',
      },
      'manufacturing'
    );
    expect(loc?.state).toBe('ok');
  });

  it('uses the Build Location for a reaction-activity plan', () => {
    const loc = planReactionLocation(
      { ...base, includeReactions: false, buildSystemId: 1, buildSystemName: 'Jita' },
      'reaction'
    );
    expect(loc?.state).toBe('highsec');
    expect(loc?.system).toEqual({ id: 1, name: 'Jita' });
  });
});
