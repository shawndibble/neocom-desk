import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { App } from '@/app/App';
import { stubViewport } from '@/test/viewport';
import {
  CHAR_ID,
  server,
  seedPlan,
  goToPlanEditor,
  openPlanTools,
  clipboard,
  installSkillPlansHarness,
} from '@/test/skillPlansPage';
import { scheduleSyncMock } from '@/test/skillPlansMocks';

vi.mock('virtual:pwa-register/react', async () =>
  (await import('@/test/skillPlansMocks')).pwaRegisterMock()
);
vi.mock('@/sync', async () => (await import('@/test/skillPlansMocks')).syncMock());
vi.mock('@/app/syncStatus', async (importOriginal) =>
  (await import('@/test/skillPlansMocks')).syncStatusMock(
    await importOriginal<typeof import('@/app/syncStatus')>()
  )
);
vi.mock('@/sde/loadSde', async () => (await import('@/test/skillPlansMocks')).loadSdeMock());

installSkillPlansHarness();

describe('SkillPlans editor: add-skill picker', () => {
  it('inserts prerequisites into the computed queue, dimmed, ahead of the user entry', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    // Column headers (checked below) only render at desktop widths (#114) —
    // jsdom's matchMedia never matches by default, so mock it to desktop.
    stubViewport(() => true);
    render(<App />);

    const search = await screen.findByRole('searchbox', { name: 'Add skill' });
    await user.type(search, 'Small Hybrid Turret');
    await user.click(await screen.findByRole('button', { name: /Small Hybrid Turret/ }));
    await user.click(await screen.findByRole('button', { name: 'Level I' }));

    const panel = screen.getByText('Your entries').closest('section')!;
    const items = await within(panel).findAllByRole('listitem');
    // No priority-band divider: every entry is Normal, a single band (#1415).
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Gunnery I'),
      expect.stringContaining('Gunnery II'),
      expect.stringContaining('Gunnery III'),
      expect.stringContaining('Small Hybrid Turret I'),
    ]);
    // The three Gunnery levels are prereqs the user didn't add directly —
    // dimmed and tagged, positioned ahead of the one row for the entry
    // they were needed by (#112: entry rows are one-per-entry, not
    // one-per-level, so Small Hybrid Turret I is a single row here).
    expect(items[0].textContent).toMatch(/prereq/i);
    expect(items[1].textContent).toMatch(/prereq/i);
    expect(items[2].textContent).toMatch(/prereq/i);
    expect(items[3].textContent).not.toMatch(/prereq/i);

    // Column headers label the two time columns (UX-REVIEW #9), by what
    // each one means rather than by the jargon they used to carry.
    expect(within(panel).getByText('Takes')).toBeInTheDocument();
    expect(within(panel).getByText('Done by')).toBeInTheDocument();

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([{ skillTypeID: 2, targetLevel: 1 }]);
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);
  });

  it("shows the expanded skill's prerequisites (untrained) and unlocks inline (#18)", async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    const search = await screen.findByRole('searchbox', { name: 'Add skill' });
    await user.type(search, 'Small Hybrid Turret');
    await user.click(await screen.findByRole('button', { name: /Small Hybrid Turret/ }));

    // Small Hybrid Turret needs Gunnery III; this character has 0 SP (emptySkillsPayload).
    const prereqsHeading = await screen.findByText('Prerequisites');
    const prereqsSection = prereqsHeading.closest('section')!;
    expect(within(prereqsSection).getByText('Gunnery')).toBeInTheDocument();
    expect(within(prereqsSection).getByText('Level 3')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Gunnery');
    await user.click(await screen.findByRole('button', { name: /^Gunnery/ }));

    const unlocksHeading = await screen.findByText('Unlocks');
    const unlocksSection = unlocksHeading.closest('section')!;
    expect(within(unlocksSection).getByText('Small Hybrid Turret')).toBeInTheDocument();
  });
});

describe('SkillPlans editor: computed queue honesty (UX-REVIEW #9)', () => {
  it('says no entries yet when the plan is empty', async () => {
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    expect(
      within(panel).getByText('No entries yet. Add a skill to get started.')
    ).toBeInTheDocument();
  });

  // #112: the merged list no longer shows a banner distinguishing "all
  // trained" from any other populated state — with entries present it just
  // renders their rows, with 0m durations when nothing is left to train.
  // The equivalent honesty check is: the entry row is there (not the
  // empty-state banner), and its duration reads zero.
  it('renders the entry row with a zero duration, not the empty-entries banner, when every entry is already trained', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({
          skills: [{ skill_id: 1, trained_skill_level: 5, skillpoints_in_skill: 999_999 }],
          total_sp: 999_999,
          unallocated_sp: 0,
        })
      )
    );
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    expect(
      within(panel).queryByText('No entries yet. Add a skill to get started.')
    ).not.toBeInTheDocument();
    // No priority-band divider (single band, #1415). Waits for the row's own duration to actually settle at zero
    // (post the async ESI "already trained" skills fetch) rather than just
    // for some listitem to exist, which could be a transient pre-recompute state.
    await waitFor(() => {
      const items = within(panel).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(items[0].textContent).toContain('Gunnery III');
      // Exact-match: a span reading precisely "0m" only happens at zero
      // duration (any real duration formats to something like "2h 5m"). One
      // cell, not two: the running-total column now reads as a finish date.
      expect(within(items[0]).getAllByText('0m')).toHaveLength(1);
    });
  });
});

describe('SkillPlans: /skills is stale until the character logs in', () => {
  it('counts a level the queue finished in the past as trained, though /skills omits it', async () => {
    // ESI: entries "that are in the past need to be applied on top of this
    // list". Without that, the plan is computed against levels already passed.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 1,
            queue_position: 0,
            finished_level: 3,
            start_date: '2026-01-01T00:00:00Z',
            finish_date: '2026-01-05T00:00:00Z',
          },
        ])
      )
    );
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    // No priority-band divider (single band, #1415). Waits for the row's own
    // duration to actually settle at zero (post the async ESI skillqueue fetch) rather than just for some
    // listitem to exist, which could be a transient pre-recompute state.
    await waitFor(() => {
      const items = within(panel).getAllByRole('listitem');
      expect(items).toHaveLength(1);
      expect(within(items[0]).getAllByText('0m')).toHaveLength(1);
    });
  });

  it('does not credit a paused queue entry, which has no finish date at all', async () => {
    // peterhaneve/evemon#40 marked skills falsely complete this way. The
    // default handler's entries are dateless, i.e. paused.
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    // No priority-band divider (single band, #1415) — wait for the row itself before checking its duration, so a
    // pre-recompute transient (with no rows/no "0m" either way) can't pass
    // this negative assertion for the wrong reason.
    // One row per level (reorder.ts): "Gunnery III" on an untrained character
    // is three rows, no band divider. The seeded plan is
    // stored unsplit, so wait for the split write rather than catching the
    // single row it renders first.
    await waitFor(async () =>
      expect(await within(panel).findAllByRole('listitem')).toHaveLength(3)
    );
    const items = await within(panel).findAllByRole('listitem');
    // Not credited as trained: the entry rows must show real, nonzero
    // duration rather than the "0m" they would show if wrongly treated as done.
    expect(within(items[0]).queryByText('0m')).not.toBeInTheDocument();
  });
});

describe('CurrentQueuePanel: what ESI knows that /skills does not', () => {
  const queuePanel = async () =>
    (await screen.findByText('Current skill queue')).closest('section')!;

  it('keeps a finished entry visible and tells the user to log in to apply it', async () => {
    // ESI holds completed entries until the character next logs in, and says
    // /skills is out of date until then. Hiding them would discard exactly
    // the information the queue exists to carry.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          {
            skill_id: 1,
            queue_position: 0,
            finished_level: 3,
            finish_date: '2020-01-01T00:00:00Z',
          },
        ])
      )
    );
    render(<App />);

    const panel = await queuePanel();
    expect(await within(panel).findByText('Done')).toBeInTheDocument();
    expect(
      within(panel).getByText(/1 skill finished training\. Log in to EVE to apply it\./i)
    ).toBeInTheDocument();
  });

  it("shows the training skill's remaining time from ESI's finish_date", async () => {
    // CurrentQueuePanel recomputes secondsRemaining from Date.now() at render
    // time, and formatDuration floors to whole hours — a finish_date exactly
    // 2h out is right on that floor's boundary, so any wall-clock time spent
    // between here and the panel's render (a real risk under CPU contention)
    // rounds it down to "1h ...". Landing mid-hour instead gives real margin.
    const finish = new Date(Date.now() + 2 * 3600_000 + 30 * 60_000).toISOString();
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json([
          { skill_id: 1, queue_position: 0, finished_level: 3, finish_date: finish },
        ])
      )
    );
    render(<App />);

    const panel = await queuePanel();
    expect(await screen.findByRole('region', { name: 'Training now' })).toBeInTheDocument();
    expect(within(panel).getByText(/^2h/)).toBeInTheDocument();
    expect(within(panel).getByText(/^left · done /)).toBeInTheDocument();
  });

  it('calls a queue with no dates paused, rather than pretending it starts now', async () => {
    // The default fixture carries no date fields — a paused queue. Inventing
    // a start time here is the EVEMon bug (peterhaneve/evemon#40).
    render(<App />);

    const panel = await queuePanel();
    // Both fixture rows are paused: the group heading, then a badge per row.
    expect(await within(panel).findByRole('heading', { name: 'Paused' })).toBeInTheDocument();
    expect(within(panel).getAllByText('Paused')).toHaveLength(3);
    expect(
      within(panel).getByText(/Training is paused, so EVE reports no completion times\./i)
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/left/i)).not.toBeInTheDocument();
  });
});

describe('SkillPlans editor: import / export', () => {
  it('imports the in-game skill queue (deduped) and exports the computed queue to the clipboard', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From skill queue' }));
    const entriesPanel = screen.getByText('Your entries').closest('section')!;
    // The entry row's name and level render as separate text nodes ("Gunnery"
    // " " "III"), so match by regex rather than the exact string "Gunnery".
    // Anchored so it matches the name cell itself rather than any other
    // occurrence of the skill's name in the row.
    expect(await within(entriesPanel).findByText(/^Gunnery\b/)).toBeInTheDocument();
    // ESI sends one row per level trained, and that is now exactly the shape
    // a plan keeps — the import no longer collapses them into one row.
    // Polled: the seeded plan already shows Gunnery, so the findByText above can
    // resolve before the import has written the stored plan.
    await waitFor(async () => {
      const stored = await db.skillPlans.get('plan-1');
      expect(stored?.entries).toEqual([
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 2 },
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 3, targetLevel: 1 },
      ]);
    });

    await user.click(screen.getByRole('button', { name: 'Export' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export to clipboard' }));
    expect(await screen.findByText('Copied to clipboard')).toBeInTheDocument();
    expect(clipboard.writeText).toHaveBeenCalledWith(
      'Gunnery I\nGunnery II\nGunnery III\nSpaceship Command I'
    );
  });

  it('shows an inline error (no unhandled rejection) when the in-game queue import fails to parse (BUG #3)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skillqueue`, () =>
        // Missing finished_level: parseSkillQueue throws synchronously.
        HttpResponse.json([{ skill_id: 1, queue_position: 0 }])
      )
    );
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From skill queue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid finished_level/);
  });
});

describe('SkillPlans editor: import from clipboard', () => {
  it('previews and applies a pasted skill plan, and reports unresolvable lines', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.type(textarea, 'Gunnery III\nNot A Real Skill II');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await within(dialog).findByText('Gunnery III')).toBeInTheDocument();
    expect(within(dialog).getByText(/unknown skill: Not A Real Skill/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // "Gunnery III" is applied as one entry and split into its per-level rows
    // by a second write, so wait for the settled list rather than whichever
    // of the two happens to be in Dexie first.
    await waitFor(async () =>
      expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 2 },
        { skillTypeID: 1, targetLevel: 3 },
      ])
    );
  });

  it('previews and applies a pasted EFT fit, resolving required skills from ESI dogma_attributes', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.click(textarea);
    // user.type() treats [ ] { } as special key syntax — paste() takes the
    // literal fit text as-is instead.
    await user.paste('[Rifter, Test Fit]\n[Empty High slot]');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    // Rifter's fixture dogma requires skill typeID 1 (Gunnery) at level 3.
    // Every item resolved, so it applies with no preview.
    expect(await screen.findByText('Added 1 skill(s)')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // "Gunnery III" is applied as one entry and split into its per-level rows
    // by a second write, so wait for the settled list rather than whichever
    // of the two happens to be in Dexie first.
    await waitFor(async () =>
      expect((await db.skillPlans.get('plan-1'))?.entries).toEqual([
        { skillTypeID: 1, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 2 },
        { skillTypeID: 1, targetLevel: 3 },
      ])
    );
  });

  it('tags an already-trained skill in the preview and excludes it from the "Added N" count (UX-REVIEW #7)', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({
          skills: [{ skill_id: 1, trained_skill_level: 5, skillpoints_in_skill: 999_999 }],
          total_sp: 999_999,
          unallocated_sp: 0,
        })
      )
    );
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    // Gunnery III: already trained to V. Spaceship Command I: not trained.
    // The unknown line is what puts the preview up.
    await user.type(textarea, 'Gunnery III\nSpaceship Command I\nNot A Real Skill II');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));

    expect(await within(dialog).findByText('Gunnery III')).toBeInTheDocument();
    expect(within(dialog).getByText('Already trained')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
    // Both entries still get applied (existing behavior) — only the confirmation count excludes the trained one.
    expect(await screen.findByText('Added 1 skill(s)')).toBeInTheDocument();

    const stored = await db.skillPlans.get('plan-1');
    expect(stored?.entries).toEqual([
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 3, targetLevel: 1 },
    ]);
  });

  it('says "0 added — all trained" when every parsed entry is already trained', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({
          skills: [{ skill_id: 1, trained_skill_level: 5, skillpoints_in_skill: 999_999 }],
          total_sp: 999_999,
          unallocated_sp: 0,
        })
      )
    );
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await user.click(await screen.findByRole('button', { name: 'Import' }));
    await user.click(await screen.findByRole('menuitem', { name: 'From text or file' }));
    const dialog = await screen.findByRole('dialog', { name: 'Import plan' });
    const textarea = within(dialog).getByLabelText(/paste an eft fit or a skill plan/i);
    await user.type(textarea, 'Gunnery III');
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    expect(await screen.findByText('0 added — all trained')).toBeInTheDocument();
  });
});

describe('SkillPlans editor: schedule timeline (#20)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
  });
  afterEach(async () => {
    // A load sleeping on a fake timer (clones prefetch) would never wake once the
    // real clock is back, and the setup's settle wait would burn its full second.
    await vi.runOnlyPendingTimersAsync();
    vi.useRealTimers();
  });

  it("projects a plan finish date that matches the entry row's own finish (#20)", async () => {
    // Gunnery I..V is a multi-day train at these attributes, so start and
    // finish land on different calendar dates. #112: this is now a single
    // aggregated entry row (Gunnery V), not five per-level rows, so its own
    // "Done by" date is the plan's own finish.
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    const items = await within(panel).findAllByRole('listitem');
    expect(items).toHaveLength(1);

    const summary = screen.getAllByText('Projected finish')[0].closest('section')!;
    const planFinishDate = within(summary)
      .getByText('Projected finish')
      .parentElement!.textContent!.replace('Projected finish', '')
      .trim();
    expect(planFinishDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // The row's own finish is the same value the Plan summary projects —
    // one number, computed one way (#20 acceptance criterion). The separate
    // start→finish line is gone: it restated the running total a third way
    // and cost every row a line it couldn't spare on a phone.
    expect(items[0].textContent).toContain(planFinishDate);
  });

  it('shows no projected finish date, and no invented start time, for an empty plan (#20)', async () => {
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);

    const panel = (await screen.findByText('Your entries')).closest('section')!;
    await within(panel).findByText('No entries yet. Add a skill to get started.');
    expect(within(panel).queryByText(/Finishes/)).not.toBeInTheDocument();
  });
});

describe('SkillPlans: current skill queue panel', () => {
  it('shows the in-game skill queue with training times, separate from any plan', async () => {
    render(<App />);

    const panel = (await screen.findByText('Current skill queue')).closest('section')!;
    const items = await within(panel).findAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('Gunnery III'),
      expect.stringContaining('Spaceship Command I'),
    ]);
  });

  // #218: the plan list/editor is what a visitor came to this page to work
  // with; the current queue is secondary reference info and must follow it,
  // not precede it.
  it('renders after the plan row and attributes on a phone, not before them', async () => {
    render(<App />);

    const plan = await screen.findByRole('button', { name: 'New plan' });
    const queuePanel = (await screen.findByText('Current skill queue')).closest('section')!;

    expect(
      plan.compareDocumentPosition(queuePanel) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
