import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { SurveyScanNode } from './SurveyScanNode';

afterEach(cleanup);

const AT = Date.UTC(2026, 9, 8, 17, 42);

describe('SurveyScanNode', () => {
  it('opens a Remove scan menu on right-click and removes that scan', async () => {
    const onRemove = vi.fn();
    render(
      <svg>
        <SurveyScanNode at={AT} cx={10} cy={20} onRemove={onRemove} />
      </svg>
    );
    fireEvent.contextMenu(screen.getByLabelText(/^Scan at/));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove scan' }));
    expect(onRemove).toHaveBeenCalledWith(AT);
  });

  it('has no menu when removal is not offered', () => {
    render(
      <svg>
        <SurveyScanNode at={AT} cx={10} cy={20} />
      </svg>
    );
    expect(screen.queryByLabelText(/^Scan at/)).toBeNull();
  });
});
