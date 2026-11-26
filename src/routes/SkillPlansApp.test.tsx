import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/app/App';
import { installSkillPlansHarness } from '@/test/skillPlansPage';
import { subscribeSyncStatusMock } from '@/test/skillPlansMocks';

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

installSkillPlansHarness({ app: true });

describe('Skills opens on Plans', () => {
  it('redirects /skills to the plan list, so the section lands on planning', async () => {
    window.history.pushState({}, '', '/skills');
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/skills/plans'));
    expect(await screen.findByRole('button', { name: 'New plan' })).toBeInTheDocument();
  });

  it('still reaches the trained-skills view from the sub-nav', async () => {
    const user = userEvent.setup({ delay: null });
    render(<App />);

    const subNav = await screen.findByRole('navigation', { name: 'Skills' });
    await user.click(within(subNav).getByRole('link', { name: 'Trained' }));
    await waitFor(() => expect(window.location.pathname).toBe('/skills/trained'));
  });
});

describe('SkillPlans: sync error visibility (UX-REVIEW #10)', () => {
  it('shows a visible "Sync error" note (not tooltip-only) when sync is in the error state', async () => {
    subscribeSyncStatusMock.mockImplementation((listener: (s: unknown) => void) => {
      listener({ state: 'error', lastSyncedAt: null, error: 'boom' });
      return () => {};
    });
    render(<App />);
    expect(await screen.findByText('Sync error — changes saved locally')).toBeInTheDocument();
  });

  it('shows nothing extra when sync is idle', async () => {
    render(<App />);
    await screen.findByText('Current skill queue');
    expect(screen.queryByText(/sync error/i)).not.toBeInTheDocument();
  });
});
