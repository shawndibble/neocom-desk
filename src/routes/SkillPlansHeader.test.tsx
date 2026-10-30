import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  openAssumptions,
  clickOptimizeMode,
  installSkillPlansHarness,
  attributesPayload,
} from '@/test/skillPlansPage';

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

describe('SkillPlans editor: plan header (#21)', () => {
  const seedTwoSkillPlan = (remapCount = 1) =>
    seedPlan({
      entries: [
        { skillTypeID: 1, targetLevel: 3 },
        { skillTypeID: 3, targetLevel: 1 },
      ],
      remapCount,
    });
  const header = () => screen.getAllByText('Projected finish')[0].closest('section')!;

  it('shows total training time, skill count, and projected finish, plus a live savings badge', async () => {
    await db.skillPlans.add(seedTwoSkillPlan());
    goToPlanEditor();
    render(<App />);
    await screen.findByText('Your entries');

    // Skill count: distinct skills in the computed queue (Gunnery,
    // Spaceship Command), matching the same set totalSeconds times.
    expect(within(header()).getByText('2')).toBeInTheDocument();
    expect(await within(header()).findByText('Remap savings')).toBeInTheDocument();
    expect(within(header()).queryByText('None')).not.toBeInTheDocument();
  });

  it('omits the savings badge entirely when the plan has no remaps to spend', async () => {
    // Otherwise the header asserts "Remap savings: None" — remapping cannot
    // help this plan — while the Actions panel below it says the opposite:
    // the derived remap budget shows remaps to spend. Remaps Available is
    // live-ESI now (#1412), not plan.remapCount — and with live ESI readable
    // the budget can never actually be 0 (a `timedRemap` slot always covers
    // an on-cooldown yearly remap, per #1404), so 0-remaps-to-spend can only
    // happen on the offline/no-scope fallback: ESI attributes unreadable and
    // the plan's stored `remapCount` itself 0.
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.error()
      )
    );
    await db.skillPlans.add(seedTwoSkillPlan(0));
    goToPlanEditor();
    render(<App />);
    await openPlanTools();
    // The fallback text proves attributes have finished loading (unreadable)
    // and the "no remaps" state was reached deliberately, so the header has
    // had its chance to render a badge and chose not to.
    await screen.findByText(
      "Remaps: 0 (from this plan's saved value — ESI attributes unavailable)"
    );

    expect(within(header()).queryByText('Remap savings')).not.toBeInTheDocument();
    expect(within(header()).queryByText('None')).not.toBeInTheDocument();
  });

  it('omits the savings badge while a Booster is active until "Optimize remaps" supplies a real answer', async () => {
    // Booster-aware costing can take seconds of synchronous time (a Booster
    // expiring mid-plan defeats placeRemaps' aggregation) — far too slow to
    // run live in a useMemo. The header must never show a number computed
    // without the active Booster once one is on, so it shows nothing until
    // the explicit, Booster-aware "Optimize remaps" click supplies one.
    const user = userEvent.setup();
    await db.skillPlans.add(seedTwoSkillPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();
    await openAssumptions();
    await screen.findByText('Your entries');

    expect(await within(header()).findByText('Remap savings')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    await user.type(await screen.findByLabelText('Days'), '5');

    await waitFor(() => {
      expect(within(header()).queryByText('Remap savings')).not.toBeInTheDocument();
    });

    await clickOptimizeMode(user, 'Place remaps only');
    await screen.findByText(/^Remapping saves|^No remap improves/);

    await waitFor(() => {
      expect(within(header()).getByText('Remap savings')).toBeInTheDocument();
    });
    expect(within(header()).queryByText('None')).not.toBeInTheDocument();
  });
});

describe('SkillPlans editor: remaps available from ESI', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the cooldown hint on the editor, and prefills a new plan created from the list with bonus remaps only', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          ...attributesPayload,
          bonus_remaps: 2,
          accrued_remap_cooldown_date: '2027-01-15T00:00:00Z',
        })
      )
    );
    const user = userEvent.setup();
    // Seed a plan so the editor (and its hint) is visible before creating:
    // the hint appearing proves the ESI attributes have loaded, so the "New
    // plan" that follows (from the list) is guaranteed to see the prefill value.
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    expect(
      await screen.findByText('Remaps: 2 bonus now · yearly from 2027-01-15')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    await openPlanTools();
    // Not user-editable anymore, but still seeded once at creation
    // (offline-fallback `remapCount`) from live ESI: the yearly remap is on
    // cooldown, so only the 2 bonus remaps count.
    await waitFor(() =>
      expect(screen.getByText('Remaps: 2 bonus now · yearly from 2027-01-15')).toBeInTheDocument()
    );
    const created = (await db.skillPlans.where('characterId').equals(CHAR_ID).toArray()).find(
      (p) => p.name === 'Untitled plan'
    );
    expect(created?.remapCount).toBe(2);
  });

  it('counts the yearly remap as ready when the cooldown date is past', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.json({
          ...attributesPayload,
          bonus_remaps: 1,
          accrued_remap_cooldown_date: '2026-08-29T11:00:00Z',
        })
      )
    );
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    expect(await screen.findByText('Remaps: 1 bonus now · yearly ready')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    await openPlanTools();
    // The cooldown date is already past, so the new plan's derived display
    // counts the yearly remap as ready too (1 bonus + yearly = 2 available).
    await waitFor(() =>
      expect(screen.getByText('Remaps: 1 bonus now · yearly ready')).toBeInTheDocument()
    );
  });
});

describe('SkillPlans editor: suggest reorder', () => {
  it('previews a grouped reorder and, on accept, rewrites and persists entry order', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 }, // Gunnery (perception/willpower)
          { skillTypeID: 3, targetLevel: 1 }, // Spaceship Command (intelligence/memory)
          { skillTypeID: 4, targetLevel: 1 }, // Small Projectile Turret (perception/willpower)
        ],
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Reorder only');

    expect(await screen.findByRole('heading', { name: 'Suggested reorder' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    const stored = await db.skillPlans.get('plan-1');
    // Gunnery's three levels stay together and in order; the reorder moves
    // the other two skills around that block.
    expect(stored?.entries).toEqual([
      { skillTypeID: 1, targetLevel: 1 },
      { skillTypeID: 1, targetLevel: 2 },
      { skillTypeID: 1, targetLevel: 3 },
      { skillTypeID: 4, targetLevel: 1 },
      { skillTypeID: 3, targetLevel: 1 },
    ]);
  });

  it('shows an inline confirmation beside the Suggest reorder button (#222)', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 3 },
          { skillTypeID: 3, targetLevel: 1 },
          { skillTypeID: 4, targetLevel: 1 },
        ],
      })
    );
    goToPlanEditor();
    render(<App />);
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Reorder only');

    // Additive: the reorder-preview modal (asserted elsewhere above) still
    // opens — this only checks the new beside-the-button confirmation.
    expect(await within(toolbar).findByRole('status')).toHaveTextContent('Reorder suggested');
  });
});

describe('SkillPlans editor: what-if implants and booster', () => {
  it('recomputes training time when switching what-if implants mode', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    render(<App />);
    await openPlanTools();
    await openAssumptions();

    const queuePanel = (await screen.findByText('Your entries')).closest('section')!;
    await within(queuePanel).findAllByRole('listitem');
    // Scoped to PlanHeader's own "Training time" chip by its unique label,
    // not a bare duration-shaped regex: the header also carries a Remap
    // savings chip once a plan has savings to show, and both render
    // duration-shaped text, so an unscoped `/^\d+[dhm]/` match is ambiguous.
    const durationHeader = () =>
      screen.getByText('Training time').parentElement!.querySelector('span:last-child')!;
    const durationBefore = durationHeader().textContent;

    const select = screen.getByRole('combobox', { name: 'What-if implants' });
    expect(select).toHaveTextContent('Current');
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: '+5' }));

    await waitFor(() => {
      expect(durationHeader().textContent).not.toBe(durationBefore);
    });
  });

  it('shows the bonus/time-left inputs only once an accelerator row exists, and flags a past expiry as expired', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    const first = render(<App />);
    await openPlanTools();
    await openAssumptions();

    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    // `find`, not `get`: the Booster is saved on the plan now, so the row
    // travels through Dexie and back before the time-left field exists.
    await screen.findByLabelText('Days');
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();

    // A past expiry can't be typed as time left, only reached by waiting or
    // by a plan saved earlier — so reopen on one.
    await db.skillPlans.update('plan-1', {
      boosters: [{ enabled: true, bonus: 3, startsAt: null, expiresAt: Date.now() - 60_000 }],
    });
    first.unmount();
    render(<App />);
    await openPlanTools();
    await openAssumptions();
    expect(await screen.findByText('Expired')).toBeInTheDocument();
  });

  it('an active (non-expired) booster reaches computeSchedule and changes training time', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    render(<App />);
    await openPlanTools();
    await openAssumptions();

    const queuePanel = (await screen.findByText('Your entries')).closest('section')!;
    await within(queuePanel).findAllByRole('listitem');
    // See the sibling "recomputes training time..." test above: scoped to
    // PlanHeader's own "Training time" chip, since an unscoped duration
    // regex can also match its Remap savings chip.
    const durationHeader = () =>
      screen.getByText('Training time').parentElement!.querySelector('span:last-child')!;
    const durationBefore = durationHeader().textContent;

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    await user.type(await screen.findByLabelText('Days'), '5');
    expect(screen.queryByText('Expired')).not.toBeInTheDocument();

    await waitFor(() => {
      expect(durationHeader().textContent).not.toBe(durationBefore);
    });
  });

  it('saves both lenses on the plan, so they survive a reload instead of resetting', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    const first = render(<App />);
    await openPlanTools();
    await openAssumptions();

    await user.click(screen.getByRole('combobox', { name: 'What-if implants' }));
    await user.click(await screen.findByRole('option', { name: '+5' }));
    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    await user.type(await screen.findByLabelText('Days'), '5');

    await waitFor(async () => {
      const stored = await db.skillPlans.get('plan-1');
      expect(stored?.whatIfImplants).toEqual({ kind: 'preset', preset: '+5' });
      expect(stored?.boosters).toHaveLength(1);
      expect(stored?.boosters?.[0]).toMatchObject({ enabled: true, bonus: 3, startsAt: null });
      const left = (stored?.boosters?.[0].expiresAt ?? 0) - Date.now();
      expect(left).toBeGreaterThan(5 * 24 * 60 * 60 * 1000 - 60_000);
      expect(left).toBeLessThanOrEqual(5 * 24 * 60 * 60 * 1000);
    });

    // The reported bug: reopening the page put every control back to its
    // default and quietly re-costed the plan.
    first.unmount();
    render(<App />);
    await openPlanTools();
    await openAssumptions();

    expect(await screen.findByLabelText('Days')).toHaveValue('5');
    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toHaveTextContent('+5');
    expect(screen.getByRole('button', { name: 'Remove accelerator 1' })).toBeInTheDocument();
  });
});
