import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimStartedSurveys } from './claimStarted';
import { forgetStartedHere, noteStartedHere, startedHereIds } from './startedHere';

const loadSurvey = vi.hoisted(() => vi.fn());
const setSurveyOwner = vi.hoisted(() => vi.fn());
const noteSurvey = vi.hoisted(() => vi.fn());
vi.mock('./surveyStore', () => ({ loadSurvey, setSurveyOwner }));
vi.mock('./surveyHistory', () => ({ noteSurvey }));

const ready = (owner: string | null) => ({ ok: true, owner });
let n = 0;
/** A fresh id each test: the claim checks each Survey once per page load. */
function started(): string {
  const id = `claim${n++}`;
  noteStartedHere(id);
  return id;
}

beforeEach(() => {
  localStorage.clear();
  loadSurvey.mockReset();
  setSurveyOwner.mockReset().mockResolvedValue(undefined);
  noteSurvey.mockReset().mockResolvedValue(undefined);
});

describe('claimStartedSurveys', () => {
  it('gives an ownerless survey started here to the signed-in pilot and lists it', async () => {
    const id = started();
    loadSurvey.mockResolvedValue(ready(null));
    expect(await claimStartedSurveys(7, 'Ana', ['Ana'])).toBe(true);
    expect(setSurveyOwner).toHaveBeenCalledWith({ id, owner: 'Ana', characterId: 7 });
    expect(noteSurvey).toHaveBeenCalledWith(id);
  });

  it("leaves another pilot's survey alone", async () => {
    started();
    loadSurvey.mockResolvedValue(ready('Bob'));
    expect(await claimStartedSurveys(7, 'Ana', ['Ana'])).toBe(false);
    expect(setSurveyOwner).not.toHaveBeenCalled();
    expect(noteSurvey).not.toHaveBeenCalled();
  });

  it('only lists a survey this account already owns', async () => {
    const id = started();
    loadSurvey.mockResolvedValue(ready('ana'));
    expect(await claimStartedSurveys(7, 'Ana', ['Ana'])).toBe(false);
    expect(setSurveyOwner).not.toHaveBeenCalled();
    expect(noteSurvey).toHaveBeenCalledWith(id);
  });

  it('forgets a survey that is gone', async () => {
    const id = started();
    loadSurvey.mockResolvedValue({ ok: false, reason: 'not-found' });
    await claimStartedSurveys(7, 'Ana', ['Ana']);
    expect(startedHereIds()).not.toContain(id);
  });
});

describe('startedHere ids', () => {
  it('lists and forgets', () => {
    noteStartedHere('keepme');
    noteStartedHere('dropme');
    forgetStartedHere('dropme');
    expect(startedHereIds()).toEqual(['keepme']);
  });
});
