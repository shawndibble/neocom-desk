import { describe, expect, it } from 'vitest';
import type { MaterialErrand } from './materialErrands';
import {
  INITIAL_EDIT_SESSION,
  editSessionGroups,
  reduceEditSession,
  shownSections,
  type EditSessionEvent,
  type MaterialsEditSession,
  type SessionToast,
} from './materialsEditSession';
import type { MaterialTableRow } from './subBuildPlan';

/**
 * A plan's rows and stored Have counts, as a test drives them: `owned` is what
 * the plan stores, and each row's remainder follows from it.
 */
interface World {
  quantity: Record<number, number>;
  owned: Record<number, number | undefined>;
  built: number[];
}

function rowsOf(world: World): MaterialTableRow[] {
  return Object.entries(world.quantity).map(([id, quantity]) => {
    const typeID = Number(id);
    const ownedQuantity = world.owned[typeID] ?? 0;
    return {
      typeID,
      quantity,
      ownedQuantity,
      remainingQuantity: Math.max(0, quantity - ownedQuantity),
      unitPrice: 10,
      lineCost: 0,
      unpriced: false,
      subBuilds: world.built.includes(typeID) ? [{}] : [],
    } as unknown as MaterialTableRow;
  });
}

/** A step: either an edit-session event, or the plan's store changing underneath it. */
type Step =
  | EditSessionEvent
  | { type: 'store'; owned?: Record<number, number | undefined>; built?: number[] };

/** Plays steps the way the table does: after every step, the session observes what renders. */
function play(world: World, steps: readonly Step[]): MaterialsEditSession {
  let session = observe(INITIAL_EDIT_SESSION, world);
  for (const step of steps) {
    if (step.type === 'store') {
      world = {
        ...world,
        owned: { ...world.owned, ...step.owned },
        built: step.built ?? world.built,
      };
    } else {
      session = reduceEditSession(session, step);
    }
    session = observe(session, world);
  }
  return session;
}

function observe(session: MaterialsEditSession, world: World): MaterialsEditSession {
  return reduceEditSession(session, {
    type: 'rendered',
    shown: shownSections(editSessionGroups(session.held, rowsOf(world))),
    ownedFor: (typeID) => world.owned[typeID],
  });
}

/** Focus entering a section holds the rows it is showing right now. */
function focus(errand: MaterialErrand, typeIDs: number[]): EditSessionEvent {
  return { type: 'focusEntered', errand, typeIDs };
}

const TRITANIUM = 34;
const PYERITE = 35;
const PARTS = 3828;

const twoMinerals: World = {
  quantity: { [TRITANIUM]: 100, [PYERITE]: 50 },
  owned: {},
  built: [],
};

describe('reduceEditSession: toasts and their undo', () => {
  const cases: {
    name: string;
    world?: World;
    steps: Step[];
    toast: SessionToast | null;
  }[] = [
    {
      name: 'a Have edit that moves a row is confirmed once focus leaves, and undo restores the old value',
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
        { type: 'focusLeft' },
      ],
      toast: {
        message: { kind: 'moved', typeID: TRITANIUM, to: 'have' },
        undo: { kind: 'owned', changes: [{ typeID: TRITANIUM, from: undefined, to: 100 }] },
      },
    },
    {
      name: 'two edits to one row undo back to the value before the first',
      world: { ...twoMinerals, owned: { [TRITANIUM]: 10 } },
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'haveCommitted', typeID: TRITANIUM, before: 10, after: 40 },
        { type: 'store', owned: { [TRITANIUM]: 40 } },
        { type: 'haveCommitted', typeID: TRITANIUM, before: 40, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
        { type: 'focusLeft' },
      ],
      toast: {
        message: { kind: 'moved', typeID: TRITANIUM, to: 'have' },
        undo: { kind: 'owned', changes: [{ typeID: TRITANIUM, from: 10, to: 100 }] },
      },
    },
    {
      name: 'two rows moved by Have edits are confirmed together',
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
        { type: 'haveCommitted', typeID: PYERITE, before: undefined, after: 50 },
        { type: 'store', owned: { [PYERITE]: 50 } },
        { type: 'focusLeft' },
      ],
      toast: {
        message: { kind: 'movedMany', count: 2 },
        undo: {
          kind: 'owned',
          changes: [
            { typeID: TRITANIUM, from: undefined, to: 100 },
            { typeID: PYERITE, from: undefined, to: 50 },
          ],
        },
      },
    },
    {
      name: 'a Have edit that keeps the row in its section says nothing',
      steps: [
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 40 },
        { type: 'store', owned: { [TRITANIUM]: 40 } },
      ],
      toast: null,
    },
    {
      name: 'a move no edit explains (a sub-build changing what is needed) says nothing',
      steps: [{ type: 'store', owned: { [TRITANIUM]: 100 } }],
      toast: null,
    },
    {
      name: 'an explained move landing beside an unexplained one says nothing',
      steps: [
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100, [PYERITE]: 50 } },
      ],
      toast: null,
    },
    {
      name: 'a build toggle is confirmed at once, with an undo that toggles back',
      world: { quantity: { [PARTS]: 10 }, owned: {}, built: [] },
      steps: [{ type: 'buildToggled', typeID: PARTS, building: false }],
      toast: {
        message: { kind: 'moved', typeID: PARTS, to: 'building' },
        undo: { kind: 'toggle', typeID: PARTS },
      },
    },
    {
      name: "a toggle's own move does not replace its toast",
      world: { quantity: { [PARTS]: 10 }, owned: {}, built: [] },
      steps: [
        { type: 'buildToggled', typeID: PARTS, building: false },
        { type: 'store', built: [PARTS] },
      ],
      toast: {
        message: { kind: 'moved', typeID: PARTS, to: 'building' },
        undo: { kind: 'toggle', typeID: PARTS },
      },
    },
    {
      name: 'undoing a toggle closes the toast, and the move back says nothing',
      world: { quantity: { [PARTS]: 10 }, owned: {}, built: [] },
      steps: [
        { type: 'buildToggled', typeID: PARTS, building: false },
        { type: 'store', built: [PARTS] },
        { type: 'undone' },
        { type: 'store', built: [] },
      ],
      toast: null,
    },
    {
      name: '"Use all" says how many rows it filled, with an undo of exactly those changes',
      steps: [
        {
          type: 'bulkApplied',
          kind: 'all',
          changes: [
            { typeID: TRITANIUM, from: undefined, to: 100 },
            { typeID: PYERITE, from: 0, to: 20 },
          ],
        },
      ],
      toast: {
        message: { kind: 'useAllDone', count: 2 },
        undo: {
          kind: 'owned',
          changes: [
            { typeID: TRITANIUM, from: undefined, to: 100 },
            { typeID: PYERITE, from: 0, to: 20 },
          ],
        },
      },
    },
    {
      name: 'the moves a bulk action causes do not replace its toast',
      steps: [
        {
          type: 'bulkApplied',
          kind: 'all',
          changes: [{ typeID: TRITANIUM, from: undefined, to: 100 }],
        },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
      ],
      toast: {
        message: { kind: 'useAllDone', count: 1 },
        undo: { kind: 'owned', changes: [{ typeID: TRITANIUM, from: undefined, to: 100 }] },
      },
    },
    {
      name: 'a bulk action with nothing to change says so, with no undo',
      steps: [{ type: 'bulkApplied', kind: 'none', changes: [] }],
      toast: { message: { kind: 'useNoneNothing' }, undo: null },
    },
    {
      name: '"Use all" with nothing to fill says so, with no undo',
      steps: [{ type: 'bulkApplied', kind: 'all', changes: [] }],
      toast: { message: { kind: 'useAllNothing' }, undo: null },
    },
    {
      name: '"Use none" counts what it cleared',
      world: { ...twoMinerals, owned: { [TRITANIUM]: 30 } },
      steps: [
        { type: 'bulkApplied', kind: 'none', changes: [{ typeID: TRITANIUM, from: 30, to: 0 }] },
      ],
      toast: {
        message: { kind: 'useNoneDone', count: 1 },
        undo: { kind: 'owned', changes: [{ typeID: TRITANIUM, from: 30, to: 0 }] },
      },
    },
    {
      name: 'a row edit that moves a row after a bulk action replaces the bulk toast',
      steps: [
        { type: 'bulkApplied', kind: 'none', changes: [] },
        { type: 'haveCommitted', typeID: PYERITE, before: undefined, after: 50 },
        { type: 'store', owned: { [PYERITE]: 50 } },
      ],
      toast: {
        message: { kind: 'moved', typeID: PYERITE, to: 'have' },
        undo: { kind: 'owned', changes: [{ typeID: PYERITE, from: undefined, to: 50 }] },
      },
    },
    {
      name: 'a bulk action replaces a row toast',
      steps: [
        { type: 'haveCommitted', typeID: PYERITE, before: undefined, after: 50 },
        { type: 'store', owned: { [PYERITE]: 50 } },
        { type: 'bulkApplied', kind: 'all', changes: [] },
      ],
      toast: { message: { kind: 'useAllNothing' }, undo: null },
    },
    {
      name: "a bulk action over a row's unlanded edit takes that move over",
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 40 },
        { type: 'store', owned: { [TRITANIUM]: 40 } },
        {
          type: 'bulkApplied',
          kind: 'all',
          changes: [{ typeID: TRITANIUM, from: 40, to: 100 }],
        },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
        { type: 'focusLeft' },
      ],
      toast: {
        message: { kind: 'useAllDone', count: 1 },
        undo: { kind: 'owned', changes: [{ typeID: TRITANIUM, from: 40, to: 100 }] },
      },
    },
    {
      name: 'the toast expiring clears it',
      steps: [{ type: 'bulkApplied', kind: 'all', changes: [] }, { type: 'toastExpired' }],
      toast: null,
    },
    {
      name: 'undo closes the toast',
      steps: [
        {
          type: 'bulkApplied',
          kind: 'all',
          changes: [{ typeID: TRITANIUM, from: undefined, to: 100 }],
        },
        { type: 'undone' },
      ],
      toast: null,
    },
  ];

  it.each(cases)('$name', ({ world = twoMinerals, steps, toast }) => {
    expect(play(world, steps).toast).toEqual(toast);
  });
});

describe('reduceEditSession: holding rows in place', () => {
  function sectionOf(session: MaterialsEditSession, world: World, typeID: number) {
    const groups = editSessionGroups(session.held, rowsOf(world));
    return (Object.keys(groups) as MaterialErrand[]).find((errand) =>
      groups[errand].some((row) => row.typeID === typeID)
    );
  }

  const cases: { name: string; steps: Step[]; section: MaterialErrand }[] = [
    {
      name: 'a row the focused section holds stays in it after its edit lands',
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
      ],
      section: 'toBuy',
    },
    {
      name: 'it moves once focus leaves the section',
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
        { type: 'focusLeft' },
      ],
      section: 'have',
    },
    {
      name: 'focus entering another section while one is held keeps the first hold',
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        focus('have', []),
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
      ],
      section: 'toBuy',
    },
    {
      name: 'tabbing from one section into the next holds the next one as shown',
      steps: [
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'focusLeft' },
        focus('toBuy', [TRITANIUM, PYERITE]),
        { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
        { type: 'store', owned: { [TRITANIUM]: 100 } },
      ],
      section: 'toBuy',
    },
  ];

  it.each(cases)('$name', ({ steps, section }) => {
    let world = twoMinerals;
    for (const step of steps) {
      if (step.type === 'store') world = { ...world, owned: { ...world.owned, ...step.owned } };
    }
    expect(sectionOf(play(twoMinerals, steps), world, TRITANIUM)).toBe(section);
  });

  it('a build toggle releases that row from the hold', () => {
    const world: World = { quantity: { [PARTS]: 10, [TRITANIUM]: 100 }, owned: {}, built: [] };
    const session = play(world, [
      focus('toBuy', [PARTS, TRITANIUM]),
      { type: 'buildToggled', typeID: PARTS, building: false },
      { type: 'store', built: [PARTS] },
    ]);
    const after = { ...world, built: [PARTS] };
    expect(sectionOf(session, after, PARTS)).toBe('building');
    expect(session.held?.has(TRITANIUM)).toBe(true);
  });
});

describe('reduceEditSession: focus after a build toggle', () => {
  it('asks for the swap control of the row that moved, from where it was', () => {
    const world: World = { quantity: { [PARTS]: 10 }, owned: {}, built: [] };
    const session = play(world, [{ type: 'buildToggled', typeID: PARTS, building: false }]);
    expect(session.focusAfterToggle).toEqual({ typeID: PARTS, kind: 'buy', from: 'toBuy' });
    expect(reduceEditSession(session, { type: 'focusSettled' }).focusAfterToggle).toBeNull();
  });

  it('a toggle off building asks for the Buy-instead side', () => {
    const world: World = { quantity: { [PARTS]: 10 }, owned: {}, built: [PARTS] };
    const session = play(world, [{ type: 'buildToggled', typeID: PARTS, building: true }]);
    expect(session.focusAfterToggle).toEqual({ typeID: PARTS, kind: 'build', from: 'building' });
  });
});

describe('reduceEditSession: settles without churn', () => {
  it('returns the same session when a render changes nothing', () => {
    const settled = play(twoMinerals, []);
    expect(observe(settled, twoMinerals)).toBe(settled);
  });

  it('focus leaving with nothing held, or focus settling with nothing asked, is a no-op', () => {
    const settled = play(twoMinerals, []);
    expect(reduceEditSession(settled, { type: 'focusLeft' })).toBe(settled);
    expect(reduceEditSession(settled, { type: 'focusSettled' })).toBe(settled);
    expect(reduceEditSession(settled, { type: 'toastExpired' })).toBe(settled);
  });

  it('forgets an edit once the plan holds it and its row is no longer held', () => {
    const session = play(twoMinerals, [
      { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 40 },
      { type: 'store', owned: { [TRITANIUM]: 40 } },
    ]);
    expect(session.pending.size).toBe(0);
  });

  it('treats a cleared field (nothing stored) as landing on 0', () => {
    const session = play({ ...twoMinerals, owned: { [TRITANIUM]: 0 } }, [
      { type: 'haveCommitted', typeID: TRITANIUM, before: 0, after: undefined },
    ]);
    expect(session.pending.size).toBe(0);
  });

  it('keeps an edit pending while its row is held', () => {
    const session = play(twoMinerals, [
      focus('toBuy', [TRITANIUM, PYERITE]),
      { type: 'haveCommitted', typeID: TRITANIUM, before: undefined, after: 100 },
      { type: 'store', owned: { [TRITANIUM]: 100 } },
    ]);
    expect(session.pending.has(TRITANIUM)).toBe(true);
  });
});
