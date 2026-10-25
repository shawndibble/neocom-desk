import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import type { InfoTemplate } from '@/engine/survey/infoTemplate';
import { SurveyInfoEditor } from './SurveyInfoPanel';
import { SurveyStartTemplates } from './SurveyStartTemplates';
import { useSurveyTemplates } from './surveyTemplates';

const { setSurveyInfo, setSurveyTax } = vi.hoisted(() => ({
  setSurveyInfo: vi.fn(),
  setSurveyTax: vi.fn(),
}));
vi.mock('./surveyStore', () => ({ setSurveyInfo, setSurveyTax, MAX_SURVEY_NOTES: 1000 }));
// The real row has its own tests; here it only shows the draft the panel hands it.
vi.mock('./MoonTaxRow', () => ({
  MoonTaxRow: ({ draft }: { draft?: { name: string; pct: string } }) => (
    <div data-testid="tax-edit">{draft ? `${draft.pct}|${draft.name}` : ''}</div>
  ),
  MoonTaxReadout: () => null,
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
    </>
  ),
}));
vi.mock('./SurveyWaypointButton', () => ({ SurveyWaypointButton: () => null }));

const SURVEY = { id: 'abc123XYZ', expiresAt: 5000, published: null, info: null };
const EFA: InfoTemplate = {
  id: 'efa',
  name: 'Efa moon 4',
  location: { id: 40001, name: 'Efa IX - Moon 4' },
  tax: { name: 'Snowfall', pct: 8 },
  notes: 'Dock at the refinery',
};
const BELT: InfoTemplate = { id: 'belt', name: 'Talidal belt', notes: 'Stay in the belt' };

async function seed(list: InfoTemplate[]) {
  await useSurveyTemplates.getState().setValue(list);
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Templates/ }));
}

beforeEach(async () => {
  await db.settings.clear();
  useSurveyTemplates.setState({ value: [], hydrated: false });
  setSurveyInfo.mockReset().mockResolvedValue(undefined);
  setSurveyTax.mockReset().mockResolvedValue(undefined);
});
afterEach(cleanup);

describe('Templates in the info panel', () => {
  it('fills location, notes and the tax draft from a picked template, and stores them', async () => {
    await seed([EFA, BELT]);
    const user = userEvent.setup();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /Efa moon 4/ }));

    expect(screen.getByTestId('picked').textContent).toBe('Efa IX - Moon 4');
    expect((screen.getByLabelText('Notes (markdown supported)') as HTMLTextAreaElement).value).toBe(
      'Dock at the refinery'
    );
    expect(screen.getByTestId('tax-edit').textContent).toBe('8|Snowfall');
    expect(screen.getByText('Template: Efa moon 4')).toBeTruthy();
    expect(screen.queryByText('Edited')).toBeNull();
    await waitFor(() =>
      expect(setSurveyInfo).toHaveBeenCalledWith({
        characterId: 7,
        id: 'abc123XYZ',
        expiresAt: 5000,
        location: { id: 40001, name: 'Efa IX - Moon 4' },
        notes: 'Dock at the refinery',
      })
    );
  });

  it('leaves the tax alone when the survey shows no moon ore', async () => {
    await seed([EFA]);
    const user = userEvent.setup();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /Efa moon 4/ }));
    expect(screen.queryByTestId('tax-edit')).toBeNull();
    expect(screen.getByTestId('picked').textContent).toBe('Efa IX - Moon 4');
  });

  it('says Edited once a held field changes, and Update template saves it', async () => {
    await seed([BELT]);
    const user = userEvent.setup();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: /Talidal belt/ }));
    expect(screen.queryByText('Edited')).toBeNull();

    fireEvent.change(screen.getByLabelText('Notes (markdown supported)'), {
      target: { value: 'Stay out of the belt' },
    });
    expect(screen.getByText('Edited')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Update template' }));

    await waitFor(() =>
      expect(useSurveyTemplates.getState().value).toEqual([
        { id: 'belt', name: 'Talidal belt', notes: 'Stay out of the belt' },
      ])
    );
    await waitFor(() => expect(screen.queryByText('Edited')).toBeNull());
  });

  it('saves the current fields under a name, leaving out what is unticked', async () => {
    const user = userEvent.setup();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} />);
    fireEvent.click(screen.getByText('pick'));
    fireEvent.change(screen.getByLabelText('Notes (markdown supported)'), {
      target: { value: 'Bring a hauler' },
    });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Save current as template…' }));

    const dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save template' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await user.click(within(dialog).getByRole('checkbox', { name: /Notes/ }));
    await user.type(within(dialog).getByLabelText('Name'), 'Efa run');
    await user.click(save);

    await waitFor(() =>
      expect(useSurveyTemplates.getState().value).toEqual([
        expect.objectContaining({ name: 'Efa run', location: { id: 30001, name: 'Efa' } }),
      ])
    );
    expect(useSurveyTemplates.getState().value[0]).not.toHaveProperty('notes');
    expect(await screen.findByText('Template: Efa run')).toBeTruthy();
  });

  it('offers Replace when the name is taken', async () => {
    await seed([BELT]);
    const user = userEvent.setup();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon={false} />);
    fireEvent.change(screen.getByLabelText('Notes (markdown supported)'), {
      target: { value: 'New notes' },
    });
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Save current as template…' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'talidal belt');
    await user.click(within(dialog).getByRole('button', { name: 'Replace template' }));
    await waitFor(() =>
      expect(useSurveyTemplates.getState().value).toEqual([
        { id: 'belt', name: 'talidal belt', notes: 'New notes' },
      ])
    );
  });

  it('renames and deletes in the list, and Undo brings a deleted one back in place', async () => {
    await seed([EFA, BELT]);
    const user = userEvent.setup();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon />);
    await openMenu(user);
    await user.click(await screen.findByRole('menuitem', { name: 'Manage templates…' }));
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getAllByRole('button', { name: 'Rename' })[1]);
    const field = within(dialog).getByLabelText('Template name');
    await user.clear(field);
    await user.type(field, 'Belt 3{Enter}');
    await waitFor(() =>
      expect(useSurveyTemplates.getState().value.map((t) => t.name)).toEqual([
        'Efa moon 4',
        'Belt 3',
      ])
    );

    await user.click(within(dialog).getAllByRole('button', { name: 'Delete' })[0]);
    await waitFor(() =>
      expect(useSurveyTemplates.getState().value.map((t) => t.id)).toEqual(['belt'])
    );
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(useSurveyTemplates.getState().value.map((t) => t.id)).toEqual(['efa', 'belt'])
    );
  });

  it('says there are no templates yet in the menu', async () => {
    const user = userEvent.setup();
    render(<SurveyInfoEditor characterId={7} survey={SURVEY} moon />);
    await openMenu(user);
    expect(await screen.findByText('No templates yet')).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Manage templates…' })).toBeNull();
  });
});

describe('SurveyStartTemplates', () => {
  it('points at where templates come from when there are none', () => {
    render(<SurveyStartTemplates templates={[]} selectedId={null} onSelect={vi.fn()} />);
    expect(screen.getByText(/After the first scan you can save/)).toBeTruthy();
  });

  it('lists templates as chips that pick and unpick one, and says what will happen', () => {
    const onSelect = vi.fn();
    const { rerender } = render(
      <SurveyStartTemplates templates={[EFA, BELT]} selectedId={null} onSelect={onSelect} />
    );
    expect(screen.getByText(/Start from a template/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Efa moon 4' }));
    expect(onSelect).toHaveBeenLastCalledWith('efa');

    rerender(<SurveyStartTemplates templates={[EFA, BELT]} selectedId="efa" onSelect={onSelect} />);
    expect(screen.getByRole('status').textContent).toMatch(/Starting with “Efa moon 4”/);
    fireEvent.click(screen.getByRole('button', { name: 'Efa moon 4' }));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });
});
