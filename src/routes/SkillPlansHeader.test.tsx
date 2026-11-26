import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { db } from '@/db';
import { renderSkillsRoutes } from '@/test/skillsRoutes';
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
    renderSkillsRoutes();
    await screen.findByText('Your entries');

    expect(within(header()).getByText('2')).toBeInTheDocument();
    expect(await within(header()).findByText('Remap savings')).toBeInTheDocument();
    expect(within(header()).queryByText('None')).not.toBeInTheDocument();
  });

  it('omits the savings badge entirely when the plan has no remaps to spend', async () => {
    server.use(
      http.get(`https://esi.evetech.net/characters/${CHAR_ID}/attributes`, () =>
        HttpResponse.error()
      )
    );
    await db.skillPlans.add(seedTwoSkillPlan(0));
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();
    await screen.findByText(
      "Remaps: 0 (saved with this plan, because your attributes didn't load)"
    );

    expect(within(header()).queryByText('Remap savings')).not.toBeInTheDocument();
    expect(within(header()).queryByText('None')).not.toBeInTheDocument();
  });

  it('omits the savings badge while a Booster is active until "Optimize remaps" supplies a real answer', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedTwoSkillPlan());
    goToPlanEditor();
    renderSkillsRoutes();
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
  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
    await db.characterAccelerators.clear();
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
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    expect(
      await screen.findByText('Remaps: 2 bonus · yearly remap from 2027-01-15')
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    await openPlanTools();
    expect(
      await screen.findByText('Remaps: 2 bonus · yearly remap from 2027-01-15')
    ).toBeInTheDocument();
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
    renderSkillsRoutes();
    await openPlanTools();

    expect(await screen.findByText('Remaps: 1 bonus · yearly remap ready')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to plans' }));
    await user.click(await screen.findByRole('button', { name: 'New plan' }));
    await openPlanTools();
    expect(await screen.findByText('Remaps: 1 bonus · yearly remap ready')).toBeInTheDocument();
  });
});

describe('SkillPlans editor: suggest reorder', () => {
  it('previews a grouped reorder and, on accept, rewrites and persists entry order', async () => {
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Reorder only');

    expect(await screen.findByRole('heading', { name: 'Suggested reorder' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));

    const stored = await db.skillPlans.get('plan-1');
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Reorder only');

    expect(await within(toolbar).findByRole('status')).toHaveTextContent('Reorder suggested');
  });
});

describe('SkillPlans editor: what-if implants and booster', () => {
  it('recomputes training time when switching what-if implants mode', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();
    await openAssumptions();

    const queuePanel = (await screen.findByText('Your entries')).closest('section')!;
    await within(queuePanel).findAllByRole('listitem');
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

  it('shows the bonus/time-left inputs only once an accelerator exists, and offers Add again once it has lapsed', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan());
    goToPlanEditor();
    const first = renderSkillsRoutes();
    await openPlanTools();
    await openAssumptions();

    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    await screen.findByLabelText('Days');

    await db.characterAccelerators.put({
      id: String(CHAR_ID),
      characterId: CHAR_ID,
      bonus: 3,
      expiresAt: Date.now() - 60_000,
      updatedAt: 1,
    });
    first.unmount();
    renderSkillsRoutes();
    await openPlanTools();
    await openAssumptions();
    expect(await screen.findByRole('button', { name: 'Add accelerator' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Days')).not.toBeInTheDocument();
  });

  it('an active (non-expired) booster reaches computeSchedule and changes training time', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();
    await openAssumptions();

    const queuePanel = (await screen.findByText('Your entries')).closest('section')!;
    await within(queuePanel).findAllByRole('listitem');
    const durationHeader = () =>
      screen.getByText('Training time').parentElement!.querySelector('span:last-child')!;
    const durationBefore = durationHeader().textContent;

    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    await user.type(await screen.findByLabelText('Days'), '5');

    await waitFor(() => {
      expect(durationHeader().textContent).not.toBe(durationBefore);
    });
  });

  it('saves both lenses on the plan, so they survive a reload instead of resetting', async () => {
    const user = userEvent.setup();
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 5 }] }));
    goToPlanEditor();
    const first = renderSkillsRoutes();
    await openPlanTools();
    await openAssumptions();
    await db.characterAccelerators.clear();
    await screen.findByRole('button', { name: 'Add accelerator' });

    await user.click(screen.getByRole('combobox', { name: 'What-if implants' }));
    await user.click(await screen.findByRole('option', { name: '+5' }));
    await user.click(screen.getByRole('button', { name: 'Add accelerator' }));
    await user.type(await screen.findByLabelText('Days'), '5');

    await waitFor(async () => {
      const stored = await db.skillPlans.get('plan-1');
      const accelerator = await db.characterAccelerators.get(String(CHAR_ID));
      const left = (accelerator?.expiresAt ?? 0) - Date.now();
      expect({
        implants: stored?.whatIfImplants,
        bonus: accelerator?.bonus,
        fiveDaysLeft: left > 5 * 24 * 60 * 60 * 1000 - 60_000 && left <= 5 * 24 * 60 * 60 * 1000,
      }).toEqual({ implants: { kind: 'preset', preset: '+5' }, bonus: 3, fiveDaysLeft: true });
    });

    first.unmount();
    renderSkillsRoutes();
    await openPlanTools();
    await openAssumptions();

    expect(await screen.findByRole('button', { name: /^Edit time left/ })).toHaveTextContent(
      /(5d 0h 0m|4d 23h \d+m)$/
    );
    expect(screen.getByRole('combobox', { name: 'What-if implants' })).toHaveTextContent('+5');
  });
});
