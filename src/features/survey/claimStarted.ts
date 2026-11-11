/**
 * Surveys started with no account stay theirs after the starter signs in. The
 * device that pasted the first scan on `/survey` is remembered (`startedHere.ts`);
 * once a Character is signed in here, each such Survey still without an owner is
 * given that Character's name (the one update a share allows) and added to the
 * pilot's Survey list, so it shows in their account like any they started signed
 * in. A Survey someone else owns is left alone, and one already owned by this
 * account is only listed. Each Survey is checked once per page load.
 */
import { ownsSurvey } from '@/engine/survey/owner';
import { noteSurvey } from './surveyHistory';
import { forgetStartedHere, startedHereIds } from './startedHere';
import { loadSurvey, setSurveyOwner } from './surveyStore';

const checked = new Set<string>();

/** Claims what this device started, returning whether any Survey changed hands. */
export async function claimStartedSurveys(
  characterId: number,
  ownerName: string,
  accountNames: readonly string[]
): Promise<boolean> {
  let claimed = false;
  for (const id of startedHereIds()) {
    if (checked.has(id)) continue;
    checked.add(id);
    const found = await loadSurvey(id, { fresh: true });
    if (!found.ok) {
      if (found.reason === 'not-found') forgetStartedHere(id);
      else checked.delete(id);
      continue;
    }
    try {
      if (found.owner === null) {
        await setSurveyOwner({ id, owner: ownerName, characterId });
        claimed = true;
      } else if (!ownsSurvey(found.owner, accountNames)) continue;
      await noteSurvey(id);
    } catch {
      // Best effort: the next visit tries again.
      checked.delete(id);
    }
  }
  return claimed;
}
