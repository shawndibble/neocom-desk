import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { PageHeader } from './PageHeader';
import { usesViewPicker } from './viewPicker';

const VIEWS = ['one', 'two', 'three', 'four'].map((id) => ({ id, label: id.toUpperCase() }));
const originalMatchMedia = window.matchMedia;

function setPhone(isPhone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: isPhone,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

describe('usesViewPicker', () => {
  it('needs a phone and four or more tabs', () => {
    expect(usesViewPicker(4, true)).toBe(true);
    expect(usesViewPicker(3, true)).toBe(false);
    expect(usesViewPicker(6, false)).toBe(false);
  });
});

describe('PageHeader view picker', () => {
  beforeEach(() => setPhone(true));
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('puts the title and current view in a menu button inside the h1', () => {
    render(<PageHeader title="Skills" views={{ tabs: VIEWS, value: 'two', onChange: vi.fn() }} />);
    const heading = screen.getByRole('heading', { level: 1 });
    const trigger = screen.getByRole('button', { name: 'Skills, TWO. Change view' });
    expect(heading).toContainElement(trigger);
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('lists every view with the current one checked and reports a pick', async () => {
    const onChange = vi.fn();
    render(<PageHeader title="Skills" views={{ tabs: VIEWS, value: 'two', onChange }} />);
    await userEvent.click(screen.getByRole('button', { name: /Change view/ }));
    expect(screen.getAllByRole('menuitemradio')).toHaveLength(4);
    expect(screen.getByRole('menuitemradio', { name: 'TWO' })).toBeChecked();
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'FOUR' }));
    expect(onChange).toHaveBeenCalledWith('four');
  });

  it('keeps a plain title with three views', () => {
    render(
      <PageHeader
        title="Skills"
        views={{ tabs: VIEWS.slice(0, 3), value: 'one', onChange: vi.fn() }}
      />
    );
    expect(screen.queryByRole('button', { name: /Change view/ })).toBeNull();
  });

  it('keeps a plain title above the phone breakpoint', () => {
    setPhone(false);
    render(<PageHeader title="Skills" views={{ tabs: VIEWS, value: 'one', onChange: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: /Change view/ })).toBeNull();
  });
});
