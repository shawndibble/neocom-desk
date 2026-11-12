/** What a vetting story in the app shell needs besides the stand-in backend (`withSampleVetting`). */
import { db } from '@/db';
import { CORP_SCOPES_FOR_CAPABILITY } from '@/features/corp/corpScopes';
import type { FixtureRoute } from './fixtureFetch';
import { SAMPLE_CHARACTERS } from './sampleData';
import { VETTING_FIXTURE_CORPORATION } from './vettingFixture';

/** ESI answers a vetting shell story needs: the pilot's roles, which decide what the corp gate draws. */
export const vettingShellRoutes = (roles: readonly string[]) => (): FixtureRoute[] => [
  { path: /^\/characters\/\d+\/roles$/, respond: () => ({ body: { roles: [...roles] } }) },
];

/** Puts the sample Characters in the fixture's corporation, so the page has one to read. */
export const seedVettingCorporation = async () => {
  await Promise.all(
    SAMPLE_CHARACTERS.map((character) =>
      db.characters.update(character.characterId, {
        corporationId: VETTING_FIXTURE_CORPORATION.corporationId,
      })
    )
  );
};

/** Every corp scope, so a Director is `ready` rather than asked to grant more. */
export const VETTING_SHELL_SCOPES: readonly string[] = [
  ...new Set(Object.values(CORP_SCOPES_FOR_CAPABILITY).flat()),
];
