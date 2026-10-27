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
      screen.getByText('Notes (markdown supported)'),
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
        characterId: expect.any(Number),
        id: 'abc123XYZ',
        expiresAt: 5000,
        location: { id: 30001, name: 'Efa' },
        notes: '',
      })
    );
    expect(screen.getByRole('button', { name: 'Set waypoint to Efa' })).toBeTruthy();
  });

  it('tells the page once a store lands, so it can re-read the survey', async () => {
    const onStored = vi.fn();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} onStored={onStored} />);
    fireEvent.click(screen.getByText('pick'));
    await waitFor(() => expect(onStored).toHaveBeenCalledTimes(1));
    expect(setSurveyInfo).toHaveBeenCalledTimes(1);
  });

  it('stores the notes on blur only, keeping the location, and not again when nothing changed', async () => {
    render(
      <SurveyInfoEditor
        characterId={7}
        survey={{ ...SURVEY, info: { location: { id: 30001, name: 'Efa' }, notes: '' } }}
        moon={false}
      />
    );
    const notes = screen.getByLabelText('Notes (markdown supported)');
    fireEvent.change(notes, { target: { value: 'Dock at the refinery.  ' } });
    expect(setSurveyInfo).not.toHaveBeenCalled();
    fireEvent.blur(notes);
    await waitFor(() =>
      expect(setSurveyInfo).toHaveBeenCalledWith({
        characterId: expect.any(Number),
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
    fireEvent.blur(screen.getByLabelText('Notes (markdown supported)'));
    expect(setSurveyInfo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('clear'));
    await waitFor(() =>
      expect(setSurveyInfo).toHaveBeenCalledWith({
        characterId: expect.any(Number),
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
    const notes = screen.getByLabelText('Notes (markdown supported)');
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

  it('shows the location with a waypoint button, the tax and the notes', async () => {
    render(
      <SurveyInfoReadout
        info={{ location: { id: 30001, name: 'Efa' }, notes: 'Dock at the **refinery**' }}
        tax={{ name: 'Moon Corp', pct: 8 }}
      />
    );
    expect(screen.getByText('Efa')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Set waypoint to Efa' })).toBeTruthy();
    expect(screen.getByTestId('tax-readout')).toBeTruthy();
    const bold = await screen.findByText('refinery');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders the notes as Markdown but never raw HTML or unsafe links', async () => {
    const { container } = render(
      <SurveyInfoReadout
        info={{
          location: null,
          notes:
            'Line one\nLine two <b>not bold</b>\n\n- [site](https://example.com)\n- [bad](javascript:alert(1))\n\n# Heading',
        }}
        tax={null}
      />
    );
    const link = await screen.findByRole('link', { name: /site/ });
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(container.querySelectorAll('a')).toHaveLength(1);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('br')).not.toBeNull();
    expect(container.textContent).toContain('<b>not bold</b>');
    expect(container.textContent).toContain('bad');
    expect(container.textContent).toContain('Heading');
  });

  it('renders headings and horizontal rules, keeping every heading below the panel title', async () => {
    const { container } = render(
      <SurveyInfoReadout
        info={{
          location: null,
          notes: '# One\n\n## Two\n\n### Three\n\n---\n\nafter <h1>raw</h1>',
        }}
        tax={null}
      />
    );
    expect(await screen.findByRole('heading', { name: 'One' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Two' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Three' })).toBeTruthy();
    expect(container.querySelector('h1')).toBeNull();
    expect(container.querySelectorAll('h2')).toHaveLength(1);
    expect(container.querySelector('hr')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'raw' })).toBeNull();
    expect(container.textContent).toContain('<h1>raw</h1>');
  });

  it('renders the rest of a Markdown cheatsheet: strikethrough, tables, quotes, code blocks, task lists, bare links', async () => {
    const notes = [
      '~~old~~ and **new**',
      '> quoted',
      '```\nblock\n```',
      '| Ore | Qty |\n|---|---|\n| Veldspar | 5 |',
      '- [x] done\n- [ ] todo',
      'see https://example.com/x now',
      '![pic](https://example.com/p.png)',
    ].join('\n\n');
    const { container } = render(<SurveyInfoReadout info={{ location: null, notes }} tax={null} />);
    expect((await screen.findByText('old')).tagName).toBe('DEL');
    expect(container.querySelector('blockquote')).not.toBeNull();
    expect(container.querySelector('pre')).not.toBeNull();
    expect(container.querySelectorAll('table th')).toHaveLength(2);
    expect(screen.getByRole('cell', { name: 'Veldspar' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Done' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Not done' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /example\.com\/x/ })).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('pic');
  });

  it('shows only the rows that were set', () => {
    render(<SurveyInfoReadout info={{ location: null, notes: 'Just notes' }} tax={null} />);
    expect(screen.queryByText('Location')).toBeNull();
    expect(screen.queryByTestId('tax-readout')).toBeNull();
    expect(screen.getByText('Just notes')).toBeTruthy();
  });
});

describe('manual locations', () => {
  it('shows a manual location without a waypoint button, in the editor and the readout', () => {
    const info = { location: { id: null, name: 'Moro' }, notes: '' };
    const { unmount } = render(
      <SurveyInfoEditor characterId={7} survey={{ ...SURVEY, info }} moon={false} />
    );
    expect(screen.getByTestId('picked').textContent).toBe('Moro');
    expect(screen.queryByRole('button', { name: /Set waypoint/ })).toBeNull();
    unmount();
    render(<SurveyInfoReadout info={info} tax={null} />);
    expect(screen.getByText('Moro')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Set waypoint/ })).toBeNull();
  });

  it('shows the waypoint for a resolved location on the readout', () => {
    render(<SurveyInfoReadout info={{ location: { id: 5, name: 'Efa' }, notes: '' }} tax={null} />);
    expect(screen.getByRole('button', { name: /Set waypoint to Efa/ })).toBeTruthy();
  });
});
