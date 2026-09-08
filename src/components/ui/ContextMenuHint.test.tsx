import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { ContextMenuHint } from './ContextMenuHint';

describe('ContextMenuHint', () => {
  it('names itself after the section and explains right-click on focus', () => {
    render(<ContextMenuHint label="Active Jobs" />);
    const trigger = screen.getByRole('button', { name: 'About Active Jobs' });

    fireEvent.focus(trigger);

    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Right-click, or press and hold on touch, for more actions.'
    );
  });
});
