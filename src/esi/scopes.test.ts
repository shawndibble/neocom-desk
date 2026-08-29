import { describe, it, expect } from 'vitest';
import { SCOPES, SCOPES_STRING } from './scopes';

describe('SCOPES', () => {
  it('lists exactly the v1 read scopes', () => {
    expect([...SCOPES].sort()).toEqual(
      [
        'esi-skills.read_skills.v1',
        'esi-skills.read_skillqueue.v1',
        'esi-clones.read_implants.v1',
        'esi-wallet.read_character_wallet.v1',
        'esi-assets.read_assets.v1',
        'esi-mail.read_mail.v1',
        'esi-calendar.read_calendar_events.v1',
        'esi-contracts.read_character_contracts.v1',
        'esi-markets.read_character_orders.v1',
        'esi-characters.read_blueprints.v1',
        'esi-industry.read_character_jobs.v1',
      ].sort()
    );
  });

  it('has no duplicates', () => {
    expect(new Set(SCOPES).size).toBe(SCOPES.length);
  });

  it('exposes a space-joined string for the SSO scope parameter', () => {
    expect(SCOPES_STRING).toBe(SCOPES.join(' '));
    expect(SCOPES_STRING.split(' ')).toHaveLength(SCOPES.length);
  });
});
