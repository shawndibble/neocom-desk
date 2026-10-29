import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { AppraisalSettingsForm } from './AppraisalSettingsForm';
import { useHaulingCargo } from './haulingCargo';

describe('AppraisalSettingsForm', () => {
  beforeEach(() => {
    useHaulingCargo.setState({ value: null, hydrated: true });
  });

  it('shows the refining fields, and says no ship is set', async () => {
    render(<AppraisalSettingsForm characterId={null} />);
    expect(await screen.findByText('Facility yield')).toBeInTheDocument();
    expect(screen.getByText('Reprocessing tax')).toBeInTheDocument();
    expect(screen.getByText(/No ship set/)).toBeInTheDocument();
  });

  it('sets the hauling ship live from the inline picker, and clears it again', async () => {
    const user = userEvent.setup();
    render(<AppraisalSettingsForm characterId={null} />);
    await user.click(await screen.findByRole('button', { name: 'Enter m³' }));
    await user.type(screen.getByRole('textbox', { name: 'Cargo space (m³)' }), '5000');
    await user.click(screen.getByRole('button', { name: 'Use' }));

    await waitFor(() => expect(useHaulingCargo.getState().value?.label).toBe('Custom'));
    expect(screen.getByText(/Custom, 5.?000/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear/ }));
    await waitFor(() => expect(useHaulingCargo.getState().value).toBeNull());
    expect(screen.getByText(/No ship set/)).toBeInTheDocument();
  });
});
