import { describe, expect, it } from 'vitest';
import { ESI_REGISTRY } from '@/esi/registry';
import { VETTING_SCOPES } from './vettingScopes';

// Read as text, not imported: the server's copy lands in its own change, and a missing module
// would fail this whole file at import rather than say what is missing.
const serverCopies = import.meta.glob<string>('../../functions/src/vettingScopes.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const serverSource = Object.values(serverCopies)[0];

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

  if (serverSource === undefined) {
    it.todo(
      'matches functions/src/vettingScopes.ts (that file does not exist yet; this runs once it does)'
    );
  } else {
    it('is exactly what the server demands of a vetting token', () => {
      const serverScopes = [...serverSource.matchAll(/['"](esi-[a-z_.-]+\.v\d+)['"]/g)].map(
        (match) => match[1]
      );
      expect([...new Set(serverScopes)].sort()).toEqual([...VETTING_SCOPES].sort());
    });
  }
});
