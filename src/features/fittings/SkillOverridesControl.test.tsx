import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { NO_SKILL_OVERRIDES } from '@/engine/fittings/skillOverrides';
import { useSkillOverrides } from './statsConditions';

vi.mock('@/sde/loadSde', () => ({
  loadSkills: async () => [
    { typeID: 3300, name: 'Gunnery' },
    { typeID: 3429, name: 'Target Management' },
    { typeID: 3430, name: 'Advanced Target Management' },
  ],
}));

const { SkillOverridesControl } = await import('./SkillOverridesControl');

afterEach(() => useSkillOverrides.setState({ skills: NO_SKILL_OVERRIDES }));

describe('SkillOverridesControl', () => {
  it('switches the stats to All 0 or All V', async () => {
    const user = userEvent.setup();
    render(<SkillOverridesControl />);
    const trigger = screen.getByRole('combobox', { name: 'Skills' });
    expect(trigger).toHaveTextContent('Own skills');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'All 0' }));
    expect(useSkillOverrides.getState().skills.base).toBe('all0');
  });

  it('sets a single skill to a level on top, and clears it again', async () => {
    const user = userEvent.setup();
    render(<SkillOverridesControl />);
    await user.click(screen.getByRole('button', { name: 'Set levels…' }));
    const dialog = screen.getByRole('dialog');

    await user.type(within(dialog).getByRole('searchbox', { name: 'Find a skill' }), 'target');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Set Advanced Target Management' })
    );
    expect(useSkillOverrides.getState().skills.levels).toEqual({ 3430: 5 });

    await user.click(
      within(dialog).getByRole('combobox', { name: 'Advanced Target Management level' })
    );
    await user.click(await screen.findByRole('option', { name: '2' }));
    expect(useSkillOverrides.getState().skills.levels).toEqual({ 3430: 2 });

    await user.click(
      within(dialog).getByRole('button', { name: 'Clear Advanced Target Management' })
    );
    expect(useSkillOverrides.getState().skills.levels).toEqual({});
  });

  it('says how many levels are set', () => {
    useSkillOverrides.setState({ skills: { base: 'character', levels: { 3300: 1, 3429: 4 } } });
    render(<SkillOverridesControl />);
    expect(screen.getByRole('button', { name: '2 levels set' })).toBeInTheDocument();
  });
});
