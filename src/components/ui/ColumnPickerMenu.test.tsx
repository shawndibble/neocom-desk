import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { claimSessionHint, hintSeenCount, resetSessionHints, useHintCounts } from '@/lib/hintFlags';
import { ColumnPickerMenu } from './ColumnPickerMenu';

const HINT = 'Toggle columns here. Some are hidden by default.';
const columnsById = { a: { header: 'Alpha' }, b: { header: 'Beta' } } as never;

const picker = (
  <ColumnPickerMenu
    available={['a', 'b']}
    visible={['a']}
    columnsById={columnsById}
    onToggle={() => {}}
    buttonLabel="Columns"
    menuTitle="Columns"
  />
);

describe('column picker hint', () => {
  beforeEach(() => {
    useHintCounts.setState({ value: {}, hydrated: true });
    resetSessionHints();
  });

  it('hints once, on the first picker only, and Got it ends it for good', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <>
        {picker}
        {picker}
      </>
    );
    expect(await screen.findAllByText(HINT)).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Got it' }));
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(hintSeenCount(useHintCounts.getState().value, 'columnPickerHint')).toBe(1);
    unmount();

    resetSessionHints();
    render(picker);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('opening the menu answers the hint', async () => {
    const user = userEvent.setup();
    render(picker);
    await screen.findByText(HINT);
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    await screen.findByRole('menuitemcheckbox', { name: 'Beta' });
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    expect(hintSeenCount(useHintCounts.getState().value, 'columnPickerHint')).toBe(1);
  });

  it('stays off before counts load, and in a session that already showed a hint', () => {
    useHintCounts.setState({ value: {}, hydrated: false });
    const { unmount } = render(picker);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
    unmount();

    useHintCounts.setState({ value: {}, hydrated: true });
    expect(claimSessionHint('goTo')).toBe(true);
    render(picker);
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });
});
