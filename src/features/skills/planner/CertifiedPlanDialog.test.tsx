import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { CertifiedPlan } from '@/sde/types';
import { loadCertifiedPlans, loadSkills } from '@/sde/loadSde';
import { CertifiedPlanDialog } from './CertifiedPlanDialog';

vi.mock('@/sde/loadSde', () => ({
  loadCertifiedPlans: vi.fn(),
  loadSkills: vi.fn(),
}));

const PLANS: CertifiedPlan[] = [
  {
    id: 21,
    name: 'Caldari Treasure Hunter',
    description: 'Hack and scan.\n\nOpen the Agency.',
    careerPathId: 4,
    factionId: 500001,
    factionName: 'Caldari State',
    entries: [{ skillTypeID: 3402, level: 1 }],
    milestones: [],
  },
  {
    id: 14,
    name: 'Manufacturer',
    description: 'Builds things.',
    careerPathId: 5,
    entries: [
      { skillTypeID: 3380, level: 1 },
      { skillTypeID: 3380, level: 2 },
    ],
    milestones: [{ skillTypeID: 3380, level: 2 }],
  },
];

beforeEach(() => {
  vi.mocked(loadCertifiedPlans).mockResolvedValue(PLANS);
  vi.mocked(loadSkills).mockResolvedValue([
    { typeID: 3380, name: 'Industry' } as Awaited<ReturnType<typeof loadSkills>>[number],
  ]);
});

function renderDialog() {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<CertifiedPlanDialog onPick={onPick} onClose={onClose} />);
  return { onPick, onClose };
}

describe('CertifiedPlanDialog', () => {
  it("opens on the first career path and lists only that path's plans", async () => {
    renderDialog();
    expect(
      await screen.findByRole('button', { name: /Caldari Treasure Hunter/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Caldari State')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Manufacturer/ })).not.toBeInTheDocument();
  });

  it('switches career path', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole('tab', { name: 'Industrialist' }));
    expect(screen.getByRole('button', { name: /Manufacturer/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Caldari Treasure Hunter/ })
    ).not.toBeInTheDocument();
  });

  it('shows the picked plan description and creates it with skill names', async () => {
    const user = userEvent.setup();
    const { onPick } = renderDialog();
    const create = await screen.findByRole('button', { name: 'Create plan' });
    expect(create).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: 'Industrialist' }));
    const row = screen.getByRole('button', { name: /Manufacturer/ });
    await user.click(row);
    expect(row).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Builds things.')).toBeInTheDocument();

    await user.click(create);
    expect(onPick).toHaveBeenCalledTimes(1);
    const [plan, nameFor] = onPick.mock.calls[0] as [CertifiedPlan, (id: number) => string];
    expect(plan.id).toBe(14);
    expect(nameFor(3380)).toBe('Industry');
  });

  it('shows a retry when the plans fail to load', async () => {
    vi.mocked(loadCertifiedPlans).mockRejectedValueOnce(new Error('offline'));
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: /Caldari Treasure Hunter/ })
    ).toBeInTheDocument();
  });
});
