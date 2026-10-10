import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { SurveyOwnerChange } from './SurveyOwnerChange';

const { searchMailRecipients, setSurveyOwner } = vi.hoisted(() => ({
  searchMailRecipients: vi.fn(),
  setSurveyOwner: vi.fn(),
}));
vi.mock('@/features/character/mailRecipientSearch', () => ({
  MIN_RECIPIENT_SEARCH_LENGTH: 3,
  searchMailRecipients,
}));
vi.mock('./surveyStore', () => ({ setSurveyOwner }));

beforeEach(() => {
  searchMailRecipients.mockReset();
  searchMailRecipients.mockResolvedValue([{ characterId: 9, name: 'New Pilot' }]);
  setSurveyOwner.mockReset();
  setSurveyOwner.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('SurveyOwnerChange', () => {
  it('finds a character, asks to confirm with the login warning, then hands over the survey', async () => {
    const onChanged = vi.fn();
    render(<SurveyOwnerChange characterId={7} surveyId="abc123" onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change owner' }));
    fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'New' } });
    expect(searchMailRecipients).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'New Pil' } });
    fireEvent.click(await screen.findByRole('button', { name: 'New Pilot' }));
    expect(setSurveyOwner).not.toHaveBeenCalled();
    expect(screen.getByText(/may need to log into Neocom Desk/)).toBeTruthy();
    // The dialog's submit button follows the footer's trigger of the same name.
    fireEvent.click(screen.getAllByRole('button', { name: 'Change owner' }).at(-1)!);
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(setSurveyOwner).toHaveBeenCalledWith({ id: 'abc123', owner: 'New Pilot' });
  });

  it('says so when the handover fails, and keeps the dialog open', async () => {
    setSurveyOwner.mockRejectedValue(new Error('denied'));
    const onChanged = vi.fn();
    render(<SurveyOwnerChange characterId={7} surveyId="abc123" onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Change owner' }));
    fireEvent.change(screen.getByLabelText('New owner'), { target: { value: 'New Pil' } });
    fireEvent.click(await screen.findByRole('button', { name: 'New Pilot' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Change owner' }).at(-1)!);
    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn't change the owner/);
    expect(onChanged).not.toHaveBeenCalled();
  });
});
