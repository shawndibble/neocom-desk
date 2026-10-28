import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import { FullIskTotal } from './FullIskTotal';

describe('FullIskTotal', () => {
  afterEach(() => configureClipboard(null));

  it('prints the full figure with the shorthand after it', () => {
    render(<FullIskTotal value={67_214_000_000} />);
    expect(screen.getByRole('button')).toHaveTextContent('67,214,000,000 ISK (67.2B)');
  });

  it('copies the full digits and confirms on the figure', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<FullIskTotal value={67_214_000_000} />);
    await userEvent.click(screen.getByRole('button'));
    expect(written).toEqual(['67,214,000,000']);
    expect(await screen.findByRole('status')).toHaveTextContent('Copied to clipboard');
  });
});
