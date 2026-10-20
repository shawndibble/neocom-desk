import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SystemNote } from './SystemNote';
import { useSystemNotes } from './systemNotes';
import '@/i18n';

function Row() {
  return (
    <>
      <SystemNote systemId={30002813} name="Tama" face="indicator" />
      <SystemNote systemId={30002813} name="Tama" face="add" />
    </>
  );
}

describe('SystemNote', () => {
  beforeEach(async () => {
    await useSystemNotes.getState().hydrate();
    await useSystemNotes.getState().setValue({});
  });

  it('offers Add note, and saves what is typed on blur', async () => {
    const user = userEvent.setup();
    render(<Row />);
    expect(screen.queryByRole('button', { name: /Open your note/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Add a note on Tama' }));
    await user.type(screen.getByRole('textbox'), 'gate camp seen');
    await user.click(document.body);

    await waitFor(() =>
      expect(useSystemNotes.getState().value[30002813]?.text).toBe('gate camp seen')
    );
    expect(screen.getByRole('button', { name: 'Open your note on Tama' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a note on Tama' })).toBeNull();
  });

  it('opens an existing note by click, with its updated date, as literal text', async () => {
    const user = userEvent.setup();
    await useSystemNotes
      .getState()
      .setValue({ 30002813: { text: '<b>x</b> safe spot', updatedAt: Date.UTC(2026, 0, 5) } });
    render(<Row />);

    await user.click(screen.getByRole('button', { name: 'Open your note on Tama' }));

    expect(screen.getByRole('textbox')).toHaveValue('<b>x</b> safe spot');
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
  });

  it('deletes the note when the text is cleared', async () => {
    const user = userEvent.setup();
    await useSystemNotes.getState().setValue({ 30002813: { text: 'old', updatedAt: 1 } });
    render(<Row />);

    await user.click(screen.getByRole('button', { name: 'Open your note on Tama' }));
    await user.clear(screen.getByRole('textbox'));
    await user.click(document.body);

    await waitFor(() => expect(useSystemNotes.getState().value).toEqual({}));
  });

  it('caps the text at 500 characters', async () => {
    const user = userEvent.setup();
    render(<Row />);
    await user.click(screen.getByRole('button', { name: 'Add a note on Tama' }));
    expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '500');
  });
});
