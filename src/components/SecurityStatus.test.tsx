import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SecurityStatus } from './SecurityStatus';
import { securityStatusColor } from '@/engine/securityStatus';

describe('SecurityStatus', () => {
  it('rounds to one decimal through shownSecurity, not the raw float', () => {
    // Balle: 0.4608891 in ESI, 0.5 in game — the exact case `shownSecurity`
    // exists to fix (see `securityStatus.ts`).
    render(<SecurityStatus security={0.4608891} />);
    expect(screen.getByText('0.5')).toBeInTheDocument();
  });

  it('colors on the raw value, same as the band it renders', () => {
    render(<SecurityStatus security={0.9459} />);
    expect(screen.getByText('0.9')).toHaveStyle({ color: securityStatusColor(0.9459) });
  });

  it('appends a caller class alongside the fixed ones', () => {
    render(<SecurityStatus security={0.5} className="shrink-0" />);
    const el = screen.getByText('0.5');
    expect(el.className).toContain('shrink-0');
    expect(el.className).toContain('font-semibold');
    expect(el.className).toContain('tabular-nums');
  });
});
