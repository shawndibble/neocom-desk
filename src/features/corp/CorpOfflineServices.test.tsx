import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { CorpOfflineServices } from './CorpOfflineServices';
import type { CorpBoardItem } from '@/engine/corp/board';

const item: CorpBoardItem = {
  id: 'service-1',
  kind: 'serviceOffline',
  subject: 'Cloning',
  detail: 'unanchored',
  deadlineMs: null,
  remainingMs: null,
  timing: 'untimed',
  severity: 'clear',
  typeId: null,
  withinStaleWindow: false,
};

describe('CorpOfflineServices', () => {
  it('renders its chip text at the shared 0.6875rem chip rung (#828)', () => {
    render(<CorpOfflineServices items={[item]} />);
    expect(screen.getByText('Cloning').closest('li')).toHaveClass('text-[0.6875rem]');
  });
});
