import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { HistoryViewSelect } from './HistoryViewSelect';

describe('HistoryViewSelect focusOnMountRef', () => {
  it('focuses the trigger once when the flag is set, then clears it', () => {
    const flag = { current: true };
    render(<HistoryViewSelect value="history" onChange={() => {}} focusOnMountRef={flag} />);
    expect(screen.getByRole('combobox', { name: 'History view' })).toHaveFocus();
    expect(flag.current).toBe(false);
  });

  it('leaves focus alone when the flag is not set', () => {
    render(
      <HistoryViewSelect value="history" onChange={() => {}} focusOnMountRef={{ current: false }} />
    );
    expect(document.body).toHaveFocus();
  });
});
