import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@/i18n';
import { SurveyInfoEditor, SurveyInfoReadout } from './SurveyInfoPanel';

const { setSurveyInfo } = vi.hoisted(() => ({ setSurveyInfo: vi.fn() }));
vi.mock('./surveyStore', () => ({ setSurveyInfo, MAX_SURVEY_NOTES: 1000 }));
// Each has its own test; here only where they sit in the panel matters.
vi.mock('./MoonTaxRow', () => ({
  MoonTaxRow: () => <div data-testid="tax-edit" />,
  MoonTaxReadout: () => <div data-testid="tax-readout" />,
}));
vi.mock('./SurveyLocationPicker', () => ({
  SurveyLocationPicker: ({
    value,
    onPick,
  }: {
    value: { name: string } | null;
    onPick: (place: { id: number; name: string } | null) => void;
  }) => (
    <>
      <span data-testid="picked">{value?.name ?? ''}</span>
      <button onClick={() => onPick({ id: 30001, name: 'Efa' })}>pick</button>
      <button onClick={() => onPick(null)}>clear</button>
    </>
  ),
}));
vi.mock('./SurveyWaypointButton', () => ({
  SurveyWaypointButton: ({ location }: { location: { name: string } }) => (
    <button>Set waypoint to {location.name}</button>
  ),
}));

const SURVEY = { id: 'abc123XYZ', expiresAt: 5000, published: null, info: null };

beforeEach(() => {
  setSurveyInfo.mockReset();
  setSurveyInfo.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('SurveyInfoEditor', () => {
  it('shows the moon tax row only for a moon survey, between the location and the notes', () => {
    const { rerender } = render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon />);
    const order = [
      screen.getByText('Location'),
      screen.getByTestId('tax-edit'),
      screen.getByText('Notes'),
    ];
    order.forEach((node, i) => {
      if (i > 0) {
        expect(
          order[i - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
        ).toBeTruthy();
      }
    });
    rerender(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} />);
    expect(screen.queryByTestId('tax-edit')).toBeNull();
    expect(screen.getByText('Additional information')).toBeTruthy();
  });

  it('stores a picked location at once, with the notes already typed, and offers the waypoint', async () => {
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} />);
    expect(screen.queryByRole('button', { name: /Set waypoint/ })).toBeNull();
    fireEvent.click(screen.getByText('pick'));
    await waitFor(() =>
      expect(setSurveyInfo).toHaveBeenCalledWith({
        id: 'abc123XYZ',
        expiresAt: 5000,
        location: { id: 30001, name: 'Efa' },
        notes: '',
      })
    );
    expect(screen.getByRole('button', { name: 'Set waypoint to Efa' })).toBeTruthy();
  });

  it('stores the notes on blur only, keeping the location, and not again when nothing changed', async () => {
    render(
      <SurveyInfoEditor
        characterId={7}
        survey={{ ...SURVEY, info: { location: { id: 30001, name: 'Efa' }, notes: '' } }}
        moon={false}
      />
    );
    const notes = screen.getByLabelText('Notes');
    fireEvent.change(notes, { target: { value: 'Dock at the refinery.  ' } });
    expect(setSurveyInfo).not.toHaveBeenCalled();
    fireEvent.blur(notes);
    await waitFor(() =>
      expect(setSurveyInfo).toHaveBeenCalledWith({
        id: 'abc123XYZ',
        expiresAt: 5000,
        location: { id: 30001, name: 'Efa' },
        notes: 'Dock at the refinery.',
      })
    );
    fireEvent.blur(notes);
    expect(setSurveyInfo).toHaveBeenCalledTimes(1);
  });

  it('stores clearing the location, and does not store what the survey already has', async () => {
    render(
      <SurveyInfoEditor
        characterId={7}
        survey={{ ...SURVEY, info: { location: { id: 30001, name: 'Efa' }, notes: 'Hi' } }}
        moon={false}
      />
    );
    fireEvent.blur(screen.getByLabelText('Notes'));
    expect(setSurveyInfo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('clear'));
    await waitFor(() =>
      expect(setSurveyInfo).toHaveBeenCalledWith({
        id: 'abc123XYZ',
        expiresAt: 5000,
        location: null,
        notes: 'Hi',
      })
    );
  });

  it('tries again on the next blur after a failed store', async () => {
    setSurveyInfo.mockRejectedValueOnce(new Error('offline'));
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} />);
    const notes = screen.getByLabelText('Notes');
    fireEvent.change(notes, { target: { value: 'Fleet on Mining.' } });
    fireEvent.blur(notes);
    await waitFor(() => expect(setSurveyInfo).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    fireEvent.blur(notes);
    await waitFor(() => expect(setSurveyInfo).toHaveBeenCalledTimes(2));
  });
});

describe('SurveyInfoReadout', () => {
  it('is left out when the creator set nothing', () => {
    const { container } = render(<SurveyInfoReadout info={null} tax={null} />);
    expect(container.firstChild).toBeNull();
    cleanup();
    const emptied = render(<SurveyInfoReadout info={{ location: null, notes: '' }} tax={null} />);
    expect(emptied.container.firstChild).toBeNull();
  });

  it('shows the location with a waypoint button, the tax and the notes as plain text', () => {
    render(
      <SurveyInfoReadout
        info={{ location: { id: 30001, name: 'Efa' }, notes: 'Line one\n<b>not bold</b>' }}
        tax={{ name: 'Moon Corp', pct: 8 }}
      />
    );
    expect(screen.getByText('Efa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set waypoint to Efa' })).toBeTruthy();
    expect(screen.getByTestId('tax-readout')).toBeTruthy();
    const notes = screen.getByText(/Line one/);
    expect(notes.textContent).toBe('Line one\n<b>not bold</b>');
    expect(notes.querySelector('b')).toBeNull();
    expect(notes.className).toContain('whitespace-pre-line');
  });

  it('shows only the rows that were set', () => {
    render(<SurveyInfoReadout info={{ location: null, notes: 'Just notes' }} tax={null} />);
    expect(screen.queryByText('Location')).toBeNull();
    expect(screen.queryByTestId('tax-readout')).toBeNull();
    expect(screen.getByText('Just notes')).toBeTruthy();
  });
});
