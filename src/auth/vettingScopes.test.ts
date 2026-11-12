import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ESI_REGISTRY } from '@/esi/registry';
import { VETTING_SCOPES } from './vettingScopes';

describe('VETTING_SCOPES', () => {
  it('is the five scopes a report reads', () => {
    expect([...VETTING_SCOPES]).toEqual([
      'esi-wallet.read_character_wallet.v1',
      'esi-characters.read_contacts.v1',
      'esi-mail.read_mail.v1',
      'esi-contracts.read_character_contracts.v1',
      'esi-skills.read_skills.v1',
    ]);
  });

  it('names only scopes the app registers', () => {
    const registered = new Set<string>(Object.values(ESI_REGISTRY).map((spec) => spec.scope));
    for (const scope of VETTING_SCOPES) expect(registered).toContain(scope);
  });

  it('is exactly what the server demands of a vetting token', () => {
    // Read as text: the functions package is not part of this module graph.
    const serverSource = readFileSync('functions/src/vettingScopes.ts', 'utf8');
    const serverScopes = [...serverSource.matchAll(/['"](esi-[a-z_.-]+\.v\d+)['"]/g)].map(
      (match) => match[1]
    );
    expect([...new Set(serverScopes)].sort()).toEqual([...VETTING_SCOPES].sort());
  });
});
