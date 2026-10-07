import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill } from './StatusPill';

describe('StatusPill', () => {
  it.each(['unassigned', 'needs-review', 'outstanding', 'paid', 'dismissed'] as const)(
    'draws %s as a word with no border (§6c: no box on static content)',
    (status) => {
      render(<StatusPill status={status} label="Label" />);
      expect(screen.getByText('Label').className).not.toMatch(/\bborder/);
    }
  );
});
