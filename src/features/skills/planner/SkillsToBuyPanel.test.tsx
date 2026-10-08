import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n';
import { SkillsToBuyPanel } from './SkillsToBuyPanel';

vi.mock('@/market/prices', () => ({
  getHubPrices: vi.fn(async () => new Map([[1, { sellMin: 1000 }]])),
  getRegionSellPrices: vi.fn(async () => new Map([[2, 500]])),
}));

const nameFor = (id: number) => `Skill ${id}`;
const entries = [{ skillTypeID: 1 }, { skillTypeID: 1 }, { skillTypeID: 2 }, { skillTypeID: 3 }];

function renderPanel(known = true, collapsible = false) {
  return render(
    <MemoryRouter>
      <SkillsToBuyPanel
        entries={entries}
        trainedSkills={new Map([[3, {}]])}
        trainedSkillsKnown={known}
        nameFor={nameFor}
        collapsible={collapsible}
      />
    </MemoryRouter>
  );
}

describe('SkillsToBuyPanel', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists unowned skills and totals them', async () => {
    renderPanel();
    expect(await screen.findByText(/Total cost/)).toBeInTheDocument();
    expect(screen.getByText('Skill 1')).toBeInTheDocument();
    expect(screen.getByText('Skill 2')).toBeInTheDocument();
    expect(screen.queryByText('Skill 3')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy multibuy/i })).toBeInTheDocument();
  });

  it('says unknown until trained skills load', () => {
    renderPanel(false);
    expect(screen.getByText(/Unknown until your skills load/)).toBeInTheDocument();
  });
  it('collapsible: a closed row with the total beside the title, expanding to the same list', async () => {
    const user = userEvent.setup();
    renderPanel(true, true);

    // Skill 1 sells for 1000 at the hub; Skill 2 falls back to the 500 region price.
    const row = await screen.findByRole('button', { name: /^skills to buy.*1\.5K ISK/i });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Skill 1')).toBeNull();
    expect(screen.getByText('2 priced · 0 without a price')).toBeInTheDocument();

    await user.click(row);

    expect(screen.queryByText(/without a price/)).toBeNull();
    expect(screen.getByText('Skill 1')).toBeInTheDocument();
    expect(screen.getByText(/Total cost/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy multibuy/i })).toBeInTheDocument();
  });
});
