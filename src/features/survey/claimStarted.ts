import { ownsSurvey } from '@/engine/survey/owner';
import { noteSurvey } from './surveyHistory';
import { forgetStartedHere, startedHereIds } from './startedHere';
import { loadSurvey, setSurveyOwner } from './surveyStore';

const checked = new Set<string>();

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
      } else if (!ownsSurvey(found.owner, accountNames)) {
        checked.delete(id);
        continue;
      }
      await noteSurvey(id);
    } catch {
      checked.delete(id);
    }
  }
  return claimed;
}
