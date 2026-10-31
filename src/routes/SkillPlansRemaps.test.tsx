import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { App } from '@/app/App';
import {
  CHAR_ID,
  server,
  seedPlan,
  goToPlanEditor,
  openPlanTools,
  clickOptimizeMode,
  toolsSection,
  installSkillPlansHarness,
  attributesPayload,
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

describe('SkillPlans editor: optimize remaps', () => {
  it('renders a savings verdict and readable remap instructions per segment', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
        remapCount: 1,
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Place remaps only');

    // A savings verdict now gets its own Accept/Reject Modal, next to the
    // button that produced it — it used to render inline, then a Panel of
    // its own further down before that.
    const dialog = await screen.findByRole('dialog', { name: 'Optimize remaps' });
    // Single verdict line (UX-REVIEW #2), not the Total/Current/Savings triple.
    expect(within(dialog).getByText(/^Remapping saves \d+[dhm]/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Total time/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Current attributes/)).not.toBeInTheDocument();
    // Actionable per-segment instruction (UX-REVIEW #6): the plan is
    // perception/willpower-heavy, so the remap maxes PER.
    expect(within(dialog).getByText(/Segment 1/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Before Gunnery I, remap to PER 27 \/ WIL 21 \/ /)
    ).toBeInTheDocument();
  });

  it('says no remap helps (and hides segments) when current attributes are already optimal', async () => {
    // The optimal spread for this perception/willpower-heavy plan: the
    // optimizer can only match it, so savings must be zero, never negative.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          charisma: 17,
          intelligence: 17,
          memory: 17,
          perception: 27,
          willpower: 21,
        })
      )
    );
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }], remapCount: 2 })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Place remaps only');

    expect(
      await screen.findByText(
        'No remap improves this plan in its current order \u2014 keeping current attributes. Try "Reorder only" to group similar skills first, then optimize again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Segment 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Remapping saves/)).not.toBeInTheDocument();
  });

  // The reported bug. Remaps Available comes from live ESI now (#1412), not
  // a free-typed `plan.remapCount` — and with live ESI readable, the budget
  // can never actually be 0: even a character with no bonus remaps whose
  // yearly remap is on cooldown still gets a `timedRemap` slot (usable once
  // the cooldown ends, per #1404), so `placeRemaps` always has at least one
  // remap to place. 0-remaps-to-spend can only happen on the offline/no-scope
  // fallback — ESI attributes unreadable and the plan's stored `remapCount`
  // itself 0 — so that's what's mocked here. The identical plan at remapCount
  // 1 saves time (first test in this block), so "no remap improves this plan
  // in its current order" is false, and its advice to try "Reorder only"
  // cannot help.
  it('says the plan has no remaps to spend, rather than blaming the plan order, at 0 Remaps Available', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.error()
      )
    );
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
        remapCount: 0,
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Place remaps only');

    expect(
      await screen.findByText('This plan has 0 remaps to spend, so nothing was placed.')
    ).toBeInTheDocument();
    expect(await within(toolbar).findByRole('status')).toHaveTextContent('No remaps to spend');
    // Not the order-blaming verdict, and not the generic inline confirmation.
    expect(screen.queryByText(/^No remap improves this plan/)).not.toBeInTheDocument();
    expect(screen.queryByText('No meaningful savings')).not.toBeInTheDocument();
  });

  it('clears the stale optimize result when an entry is removed, instead of crashing on an out-of-range segment index (BUG #1)', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
        remapCount: 1,
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Place remaps only');
    expect(await screen.findByText(/^Remapping saves/)).toBeInTheDocument();

    const entriesPanel = screen.getByText('Your entries').closest('section')!;
    // Remove enough entries to shrink the scheduled queue below the stale
    // segment's startIndex — must not throw, and must drop the stale panel
    // rather than render against the old (now out-of-range) schedule.
    // The row's ⋮ menu holds Remove (#112): the item's accessible name is "Remove {skill}
    // {level}". The level is part of the name because a
    // plan holds one row per level, so "Gunnery III" alone would match three
    // buttons. Removing opens a confirm Modal (#408) rather than removing
    // immediately.
    await user.click(
      within(entriesPanel).getByRole('button', { name: 'More actions for Gunnery III' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remove Gunnery III' }));

    await waitFor(() => expect(screen.queryByText(/^Remapping saves/)).not.toBeInTheDocument());
    // The rest of the app must still be usable — no crash boundary tripped.
    expect(await screen.findByText('Your entries')).toBeInTheDocument();
  });

  it('shows an inline confirmation beside the Optimize remaps button (#222)', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
        remapCount: 1,
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Place remaps only');

    // Additive: the full panel result (asserted elsewhere above) still
    // renders — this only checks the new beside-the-button confirmation.
    expect(await within(toolbar).findByRole('status')).toHaveTextContent(/^Saves \d+[dhm]/);
  });
});

describe('SkillPlans editor: remap markers', () => {
  it('adds a removable marker row and persists positions in Dexie (no schema bump)', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    expect(screen.queryByText('Remap marker')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add remap marker' }));
    expect(await screen.findByText('Remap marker')).toBeInTheDocument();
    // Appended after the last entry: position === entries.length, which is 4
    // once "Gunnery III" is held as its three per-level rows.
    await waitFor(async () => expect((await db.skillPlans.get('plan-1'))?.markers).toEqual([4]));
    expect(scheduleSyncMock).toHaveBeenCalledWith(CHAR_ID);

    await user.click(screen.getByRole('button', { name: 'Remove remap marker 1' }));
    await waitFor(() => expect(screen.queryByText('Remap marker')).not.toBeInTheDocument());
    expect((await db.skillPlans.get('plan-1'))?.markers).toEqual([]);
  });

  it('shows an inline confirmation beside the Add marker button (#222)', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Add remap marker' }).closest('section')!;
    await user.click(screen.getByRole('button', { name: 'Add remap marker' }));

    expect(await within(toolbar).findByRole('status')).toHaveTextContent('Marker added');
  });

  it('optimize at my markers reports the current-attributes segment and a best spread per marker segment', async () => {
    const user = userEvent.setup({ delay: null });
    // Marker at entry position 1: train Gunnery I..V on current attributes,
    // remap before Spaceship Command (int/mem).
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 5 },
          { skillTypeID: 3, targetLevel: 3 },
        ],
        markers: [1],
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    await user.click(screen.getByRole('button', { name: 'Optimize' }));
    const optimizeItem = screen.getByRole('menuitem', { name: 'Use my remap markers' });
    expect(optimizeItem).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(optimizeItem);

    await screen.findByText(/^Remapping saves/);
    expect(toolsSection('Actions')).toBeInTheDocument();
    // Verdict line, same pattern as "optimize now".
    expect(screen.getByText(/^Remapping saves \d+[dhm]/)).toBeInTheDocument();
    // Segment 1: leading current-attributes prefix, no remap spent.
    expect(screen.getByText('From Gunnery I, keep current attributes')).toBeInTheDocument();
    // Segment 2: the marker's segment gets its own best spread (int/mem-heavy).
    expect(
      screen.getByText(/Before Spaceship Command I, remap to INT 27 \/ MEM 21 \//)
    ).toBeInTheDocument();
  });

  // The other half of the reported bug. "Add remap marker" appends the
  // marker at the end of the entry list and the user drags it up; an
  // undragged marker delimits an empty segment, which optimizeAtMarkers
  // drops — so savings are exactly zero and no remap is ever weighed. The
  // same plan with the marker at position 1 saves time (test above), so
  // "remapping at these markers doesn't save time" misreads the situation.
  it('says a marker at the end of the plan splits nothing, rather than that remapping there does not pay', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 5 },
          { skillTypeID: 3, targetLevel: 3 },
        ],
        // Where "Add remap marker" puts it: after the last entry.
        markers: [2],
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Use my remap markers');

    expect(
      await screen.findByText(
        'Every remap marker sits at the end of the plan, so nothing follows it to remap for — drag a marker in front of the skills it should speed up.'
      )
    ).toBeInTheDocument();
    expect(await within(toolbar).findByText('No marker splits the plan')).toBeInTheDocument();
    expect(screen.queryByText(/^Remapping at these markers/)).not.toBeInTheDocument();
    expect(screen.queryByText('No meaningful savings')).not.toBeInTheDocument();
    // No segment list under the message: the only segment is the whole plan
    // on current attributes, which reads as a contradiction of it.
    expect(screen.queryByText(/^Segment 1/)).not.toBeInTheDocument();
  });

  it('states what the markers save without waiting for a click', async () => {
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 5 },
          { skillTypeID: 3, targetLevel: 3 },
        ],
        markers: [1],
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;

    // Standing, not a post-click toast: a plan carrying a remap line says
    // what that line saves the moment it is opened. The button beside it
    // opens the Modal that accepts the spread.
    expect(await within(toolbar).findByText(/^Saves \d+[dhm]/)).toBeInTheDocument();
  });

  it('disables "Optimize at my markers" when the plan has no markers', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    await user.click(screen.getByRole('button', { name: 'Optimize' }));
    expect(screen.getByRole('menuitem', { name: 'Use my remap markers' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});

describe('SkillPlans editor: the remap cap is disclosed', () => {
  // Remaps Available is derived from live ESI now (#1412), not the plan's
  // own remapCount, so "the plan asks for N" is driven by mocking ESI's
  // bonus_remaps (with the yearly remap left ready, off cooldown) rather
  // than by seedPlan — `available` = bonus_remaps + 1.
  const optimize = async (available: number) => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({ ...attributesPayload, bonus_remaps: available - 1 })
      )
    );
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
        ],
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();
    await clickOptimizeMode(user, 'Place remaps only');
    await screen.findByText(/^Remapping saves|^No remap improves/);
  };

  it('says the optimizer evaluated fewer remaps than the plan allows', async () => {
    // An answer for one remap, shown for a plan that asks for three, is the
    // silent-degradation failure this planner keeps running into.
    await optimize(3);
    expect(screen.getByText(/Evaluated with 2 remaps/i)).toBeInTheDocument();
  });

  it.each([1, 2])('says nothing when the plan asks for %i remap(s)', async (available) => {
    // Two is the cap, not a capped value: the note must not fire at the
    // boundary itself.
    await optimize(available);
    expect(screen.queryByText(/is not available yet/i)).not.toBeInTheDocument();
  });
});
