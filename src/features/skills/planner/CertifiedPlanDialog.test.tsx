import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { CertifiedPlan } from '@/sde/types';
import { loadCertifiedPlans, loadSkills } from '@/sde/loadSde';
import { CertifiedPlanDialog } from './CertifiedPlanDialog';
import { usePlanEditorData } from './usePlanEditorData';

vi.mock('./usePlanEditorData', () => ({ usePlanEditorData: vi.fn() }));

function mockTrained(levels: Record<number, number> | null) {
  vi.mocked(usePlanEditorData).mockReturnValue({
    trainedSkills: new Map(
      Object.entries(levels ?? {}).map(([id, level]) => [Number(id), { level, sp: 0 }])
    ),
    trainedSkillsKnown: levels !== null,
    loaded: true,
  } as unknown as ReturnType<typeof usePlanEditorData>);
}

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
  mockTrained(null);
  vi.mocked(loadCertifiedPlans).mockResolvedValue(PLANS);
  vi.mocked(loadSkills).mockResolvedValue([
    { typeID: 3380, name: 'Industry' } as Awaited<ReturnType<typeof loadSkills>>[number],
  ]);
});

function renderDialog() {
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(<CertifiedPlanDialog characterId={1} onPick={onPick} onClose={onClose} />);
  return { onPick, onClose };
}

describe('CertifiedPlanDialog', () => {
  it("opens on the first career path and lists only that path's plans", async () => {
    renderDialog();
    expect(
      await screen.findByRole('radio', { name: /Caldari Treasure Hunter/ })
    ).toBeInTheDocument();
    expect(screen.getByText('Caldari State')).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Manufacturer/ })).not.toBeInTheDocument();
  });

  it('switches career path', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole('tab', { name: 'Industrialist' }));
    expect(screen.getByRole('radio', { name: /Manufacturer/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('radio', { name: /Caldari Treasure Hunter/ })
    ).not.toBeInTheDocument();
  });

  it('shows the picked plan description and creates it with skill names', async () => {
    const user = userEvent.setup();
    const { onPick } = renderDialog();
    const create = await screen.findByRole('button', { name: 'Create plan' });
    expect(create).toBeDisabled();

    await user.click(screen.getByRole('tab', { name: 'Industrialist' }));
    const row = screen.getByRole('radio', { name: /Manufacturer/ });
    await user.click(row);
    expect(row).toBeChecked();
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
      await screen.findByRole('radio', { name: /Caldari Treasure Hunter/ })
    ).toBeInTheDocument();
  });

  it('hides plans the character has fully trained', async () => {
    mockTrained({ 3402: 1, 3380: 1 });
    const user = userEvent.setup();
    renderDialog();
    await user.click(await screen.findByRole('tab', { name: 'Industrialist' }));
    expect(screen.getByRole('radio', { name: /Manufacturer/ })).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Explorer' }));
    expect(
      screen.queryByRole('radio', { name: /Caldari Treasure Hunter/ })
    ).not.toBeInTheDocument();
  });

  it('counts only the levels still untrained and passes the trained levels on', async () => {
    mockTrained({ 3380: 1 });
    const user = userEvent.setup();
    const { onPick } = renderDialog();
    await user.click(await screen.findByRole('tab', { name: 'Industrialist' }));
    const row = screen.getByRole('radio', { name: /Manufacturer/ });
    expect(row).toHaveAccessibleName(/1 skill level/);
    await user.click(row);
    await user.click(screen.getByRole('button', { name: 'Create plan' }));
    const trained = onPick.mock.calls[0][2] as Map<number, { level: number }>;
    expect(trained.get(3380)?.level).toBe(1);
  });

  it('says so in a tab whose plans are all trained, and keeps the tab', async () => {
    mockTrained({ 3402: 1 });
    const user = userEvent.setup();
    renderDialog();
    expect(await screen.findByText('All Certified Plans Complete')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Industrialist' }));
    expect(screen.queryByText('All Certified Plans Complete')).not.toBeInTheDocument();
  });

  it('shows every plan while the trained levels are unknown', async () => {
    mockTrained(null);
    renderDialog();
    expect(
      await screen.findByRole('radio', { name: /Caldari Treasure Hunter/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('All Certified Plans Complete')).not.toBeInTheDocument();
  });

  it('waits for the trained levels before offering plans', async () => {
    vi.mocked(usePlanEditorData).mockReturnValue({
      loaded: false,
      trainedSkills: new Map(),
      trainedSkillsKnown: false,
    } as unknown as ReturnType<typeof usePlanEditorData>);
    renderDialog();
    expect(await screen.findByRole('button', { name: 'Create plan' })).toBeDisabled();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
