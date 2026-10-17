import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { SurveyViewSelect } from './SurveyViewSelect';

afterEach(cleanup);

describe('SurveyViewSelect', () => {
  it('shows the current view under its label', () => {
    render(<SurveyViewSelect value="depletion" onChange={() => {}} views={['ore', 'depletion']} />);
    expect(screen.getByRole('combobox', { name: 'Chart view' })).toHaveTextContent(
      'Depletion by ore'
    );
  });

  it('offers only the views it is given and reports the pick', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SurveyViewSelect value="ore" onChange={onChange} views={['ore', 'isk']} />);
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByRole('option', { name: 'Depletion by ore' })).toBeNull();
    await user.click(await screen.findByRole('option', { name: 'ISK left' }));
    expect(onChange).toHaveBeenCalledWith('isk');
  });
});
