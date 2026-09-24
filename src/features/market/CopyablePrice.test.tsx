import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { configureClipboard } from '@/lib/clipboard';
import { CopyablePrice } from './CopyablePrice';
import { priceClipboardText } from './priceClipboardText';

describe('priceClipboardText', () => {
  it('drops the decimal for a whole-ISK price', () => {
    expect(priceClipboardText(1_233_000)).toBe('1233000');
  });

  it('keeps two decimal places, no thousands separators, for a price with cents', () => {
    expect(priceClipboardText(12.34)).toBe('12.34');
    expect(priceClipboardText(449.9)).toBe('449.90');
  });

  it('pads a single cent digit', () => {
    expect(priceClipboardText(9.05)).toBe('9.05');
  });

  it('never groups thousands', () => {
    expect(priceClipboardText(1_235_000.5)).toBe('1235000.50');
  });
});

describe('CopyablePrice', () => {
  afterEach(() => configureClipboard(null));

  it('shows the formatted price on screen', () => {
    render(<CopyablePrice price={449.9} />);
    expect(screen.getByText('449.90')).toBeInTheDocument();
  });

  it('copies the plain-digit legal price, not the on-screen grouped text, and confirms it', async () => {
    const written: string[] = [];
    configureClipboard(async (text) => {
      written.push(text);
    });
    render(<CopyablePrice price={1_233_000} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Copy 1,233,000.00' }));

    expect(written).toEqual(['1233000']);
    expect(screen.getByRole('status')).toHaveTextContent('Copied to clipboard');
    // The button's own accessible name never changes — the live region is
    // what a screen reader hears, same as `CopyableTotal`'s own pattern.
    expect(screen.getByRole('button', { name: 'Copy 1,233,000.00' })).toBeInTheDocument();
  });

  it("names the price in the button's accessible name", () => {
    render(<CopyablePrice price={12.34} />);
    expect(screen.getByRole('button', { name: 'Copy 12.34' })).toBeInTheDocument();
  });

  it('drops the visible price text with showValue={false}, keeping the accessible name', () => {
    render(<CopyablePrice price={449.9} showValue={false} />);
    expect(screen.queryByText('449.90')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy 449.90' })).toBeInTheDocument();
  });

  it('swaps the icon glyph while the copied confirmation is up, for a sighted pointer user', async () => {
    configureClipboard(async () => {});
    render(<CopyablePrice price={449.9} />);
    const button = screen.getByRole('button', { name: 'Copy 449.90' });
    const iconBefore = button.querySelector('svg')?.outerHTML;
    expect(iconBefore).toBeTruthy();

    const user = userEvent.setup();
    await user.click(button);

    // A different glyph renders (copy icon -> checkmark) — the live region
    // is `sr-only`, so this is the only visible confirmation a pointer user
    // gets that the copy actually happened.
    expect(button.querySelector('svg')?.outerHTML).not.toBe(iconBefore);
    // The accessible name and tooltip never change — only the decorative icon.
    expect(screen.getByRole('button', { name: 'Copy 449.90' })).toBeInTheDocument();
  });
});
