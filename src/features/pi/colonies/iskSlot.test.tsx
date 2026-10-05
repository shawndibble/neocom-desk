import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { tWithIsk } from './iskSlot';

describe('tWithIsk', () => {
  it('renders shorthand with the exact figure as hidden text', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <p>{tWithIsk(i18n.t, 'piColonies.action.keeps', { perDay: '/day' }, 1_234_567)}</p>
      </I18nextProvider>
    );
    expect(screen.getByText(/Keeps/).textContent).toContain('1.2M');
    expect(screen.getByText(/1,234,567 ISK/)).toBeTruthy();
  });
});
