import { describe, expect, it } from 'vitest';
import {
  currentApproval,
  isFinished,
  recordApproval,
  startFinishSetup,
  stillToApprove,
  type FinishSetupInput,
} from './finishSetup';

const BOOK = { collectorCorporationId: 500, editorCharacterId: 1, onBook: [600] };

const base: FinishSetupInput = {
  characterId: 7,
  ceoOf: { corporationId: 700, name: 'Ironvale Reach' },
  book: BOOK,
  hiddenCorporationIds: [],
  alertsOnElsewhere: true,
  alertsHeld: false,
  notNow: [],
};

describe('stillToApprove', () => {
  it('offers the moon book and closed-app alerts to a CEO of an unadded corp with alerts on elsewhere', () => {
    expect(stillToApprove(base)).toEqual([
      {
        kind: 'moon',
        corporationId: 700,
        corporationName: 'Ironvale Reach',
        collectorCorporationId: 500,
        editorCharacterId: 1,
      },
      { kind: 'alerts' },
    ]);
  });

  it('offers only alerts to a character who is not a CEO', () => {
    expect(stillToApprove({ ...base, ceoOf: undefined })).toEqual([{ kind: 'alerts' }]);
  });

  it('offers nothing to a character with nothing to do', () => {
    expect(
      stillToApprove({ ...base, ceoOf: undefined, alertsOnElsewhere: false, book: undefined })
    ).toEqual([]);
    expect(stillToApprove({ ...base, ceoOf: undefined, alertsHeld: true })).toEqual([]);
  });

  it('never offers a hidden corporation', () => {
    expect(stillToApprove({ ...base, hiddenCorporationIds: [700] })).toEqual([{ kind: 'alerts' }]);
  });

  it('never offers a corporation already on the book, the book itself, or with no book to join', () => {
    expect(stillToApprove({ ...base, book: { ...BOOK, onBook: [700] } })).toEqual([
      { kind: 'alerts' },
    ]);
    expect(stillToApprove({ ...base, book: { ...BOOK, collectorCorporationId: 700 } })).toEqual([
      { kind: 'alerts' },
    ]);
    expect(stillToApprove({ ...base, book: undefined })).toEqual([{ kind: 'alerts' }]);
  });

  it('leaves out what the player said Not now to for this character', () => {
    expect(stillToApprove({ ...base, notNow: ['moon'] })).toEqual([{ kind: 'alerts' }]);
    expect(stillToApprove({ ...base, notNow: ['moon', 'alerts'] })).toEqual([]);
  });
});

describe('the finish-setup chain', () => {
  const items = stillToApprove(base);

  it('runs the approvals in order and finishes', () => {
    let chain = startFinishSetup({ characterId: 7, name: 'Kestrel Vane', items });
    expect(currentApproval(chain)?.kind).toBe('moon');
    chain = recordApproval(chain, { kind: 'moon', result: 'done' });
    expect(currentApproval(chain)?.kind).toBe('alerts');
    expect(chain.last).toEqual({ kind: 'moon', result: 'done' });
    chain = recordApproval(chain, { kind: 'alerts', result: 'not-done' });
    expect(currentApproval(chain)).toBeUndefined();
    expect(isFinished(chain)).toBe(true);
    expect(chain.results).toEqual({ moon: 'done', alerts: 'not-done' });
  });

  it('stays on the same item after a wrong character, and says who it was', () => {
    let chain = startFinishSetup({ characterId: 7, name: 'Kestrel Vane', items });
    chain = recordApproval(chain, { kind: 'moon', result: 'wrong-character', signedInAs: 'Dax' });
    expect(currentApproval(chain)?.kind).toBe('moon');
    expect(chain.last).toEqual({ kind: 'moon', result: 'wrong-character', signedInAs: 'Dax' });
    expect(chain.results).toEqual({});
  });

  it('ignores a result for an approval that is not the current one', () => {
    const chain = startFinishSetup({ characterId: 7, name: 'Kestrel Vane', items });
    expect(recordApproval(chain, { kind: 'alerts', result: 'done' })).toBe(chain);
  });
});
