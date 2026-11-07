import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderInRouter as render } from '@/test/render';
import '@/i18n';
import type { SkillType } from '@/sde/types';
import { IndustryExplainerTrigger } from './IndustryExplainer';

const skill = (typeID: number, name: string, groupID: number, alphaMaxLevel?: number) =>
  ({
    typeID,
    name,
    groupID,
    alphaMaxLevel,
    description: '',
    groupName: '',
    rank: 1,
    primaryAttr: 'memory',
    secondaryAttr: 'intelligence',
    prereqs: [],
  }) as SkillType;

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => [
    skill(3380, 'Industry', 268, 5),
    skill(3388, 'Advanced Industry', 268),
    skill(3402, 'Science', 270, 4),
  ]),
}));

describe('IndustryExplainerTrigger', () => {
  it('opens the explainer, lists the Alpha caps, and closes on Escape and on Close', async () => {
    const user = userEvent.setup();
    render(<IndustryExplainerTrigger />);

    const trigger = screen.getByRole('button', { name: 'New to Industry?' });
    expect(within(trigger).getByText('New to Industry?')).not.toHaveClass('hidden');

    await user.click(trigger);
    const dialog = await screen.findByRole('dialog', { name: /New to Industry\?/ });
    expect(await within(dialog).findByText('Industry, up to level 5')).toBeInTheDocument();
    expect(within(dialog).getByText('Science, up to level 4')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Advanced Industry/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('link', { name: /EVE University: Manufacturing/ })
    ).toHaveAttribute('href', 'https://wiki.eveuniversity.org/Manufacturing');

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(trigger);
    const reopened = await screen.findByRole('dialog', { name: /New to Industry\?/ });
    await user.click(within(reopened).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
