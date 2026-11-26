import { describe, expect, it, vi } from 'vitest';
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
  clickOptimizeMode,
  toolsSection,
  installSkillPlansHarness,
  attributesPayload,
} from '@/test/skillPlansPage';
import { scheduleSyncMock } from '@/test/skillPlansMocks';

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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Place remaps only');

    const dialog = await screen.findByRole('dialog', { name: 'Optimize remaps' });
    expect(within(dialog).getByText(/^Remapping saves \d+[dhm]/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/Total time/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Current attributes/)).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Segment 1/)).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Before Gunnery I, remap to PER 27 \/ WIL 21 \/ /)
    ).toBeInTheDocument();
  });

  it('says no remap helps (and hides segments) when current attributes are already optimal', async () => {
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Place remaps only');

    expect(
      await screen.findByText(
        'No remap speeds up this plan in its current order, so your attributes stay as they are. Try "Reorder only" to group similar skills first, then optimize again.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/Segment 1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Remapping saves/)).not.toBeInTheDocument();
  });

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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Place remaps only');

    expect(
      await screen.findByText('This plan has no remaps to spend, so none were placed.')
    ).toBeInTheDocument();
    expect(await within(toolbar).findByRole('status')).toHaveTextContent('No remaps to spend');
    expect(screen.queryByText(/^No remap improves this plan/)).not.toBeInTheDocument();
    expect(screen.queryByText('No time saved')).not.toBeInTheDocument();
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    await clickOptimizeMode(user, 'Place remaps only');
    expect(await screen.findByText(/^Remapping saves/)).toBeInTheDocument();

    const entriesPanel = screen.getByText('Your entries').closest('section')!;
    await user.click(
      within(entriesPanel).getByRole('button', { name: 'More actions for Gunnery III' })
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Remove Gunnery III' }));

    await waitFor(() => expect(screen.queryByText(/^Remapping saves/)).not.toBeInTheDocument());
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Place remaps only');

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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    expect(screen.queryByText('Remap marker')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add remap marker' }));
    expect(await screen.findByText('Remap marker')).toBeInTheDocument();
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Add remap marker' }).closest('section')!;
    await user.click(screen.getByRole('button', { name: 'Add remap marker' }));

    expect(await within(toolbar).findByRole('status')).toHaveTextContent('Marker added');
  });

  it('optimize at my markers reports the current-attributes segment and a best spread per marker segment', async () => {
    const user = userEvent.setup({ delay: null });
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    await user.click(screen.getByRole('button', { name: 'Optimize' }));
    const optimizeItem = screen.getByRole('menuitem', { name: 'Use my remap markers' });
    expect(optimizeItem).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(optimizeItem);

    await screen.findByText(/^Remapping saves/);
    expect(toolsSection('Actions')).toBeInTheDocument();
    expect(screen.getByText(/^Remapping saves \d+[dhm]/)).toBeInTheDocument();
    expect(screen.getByText('From Gunnery I, keep current attributes')).toBeInTheDocument();
    expect(
      screen.getByText(/Before Spaceship Command I, remap to INT 27 \/ MEM 21 \//)
    ).toBeInTheDocument();
  });

  it('says a marker at the end of the plan splits nothing, rather than that remapping there does not pay', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(
      seedPlan({
        entries: [
          { skillTypeID: 1, targetLevel: 5 },
          { skillTypeID: 3, targetLevel: 3 },
        ],
        markers: [2],
      })
    );
    goToPlanEditor();
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;
    await clickOptimizeMode(user, 'Use my remap markers');

    expect(
      await screen.findByText(
        'Every remap marker is at the end of the plan, so it speeds up nothing. Drag a marker above the skills it should speed up.'
      )
    ).toBeInTheDocument();
    expect(await within(toolbar).findByText('No marker splits the plan')).toBeInTheDocument();
    expect(screen.queryByText(/^Remapping at these markers/)).not.toBeInTheDocument();
    expect(screen.queryByText('No time saved')).not.toBeInTheDocument();
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
    renderSkillsRoutes();
    await openPlanTools();

    await screen.findByText('Your entries');
    const toolbar = screen.getByRole('button', { name: 'Optimize' }).closest('section')!;

    expect(await within(toolbar).findByText(/^Saves \d+[dhm]/)).toBeInTheDocument();
  });

  it('disables "Optimize at my markers" when the plan has no markers', async () => {
    const user = userEvent.setup({ delay: null });
    await db.skillPlans.add(seedPlan({ entries: [{ skillTypeID: 1, targetLevel: 3 }] }));
    goToPlanEditor();
    renderSkillsRoutes();
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
    renderSkillsRoutes();
    await openPlanTools();
    await clickOptimizeMode(user, 'Place remaps only');
    await screen.findByText(/^Remapping saves|^No remap improves/);
  };

  it('says the optimizer evaluated fewer remaps than the plan allows', async () => {
    await optimize(3);
    expect(screen.getByText(/Worked out with 2 remaps/i)).toBeInTheDocument();
  });

  it.each([1, 2])('says nothing when the plan asks for %i remap(s)', async (available) => {
    await optimize(available);
    expect(screen.queryByText(/is not available yet/i)).not.toBeInTheDocument();
  });
});
