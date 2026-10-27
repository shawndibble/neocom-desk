import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ContinueSessionCard } from './ContinueSessionCard';
import type { SessionContinuation } from './sessionContinuation';

/** Only the fields the card reads; the rest of a ledger row is irrelevant here. */
const CONTINUATION = {
  next: {
    key: 'next',
    row: {
      entry: { date: '2026-10-09', solarSystemId: 30000142 },
      unassignedOreLines: [],
    },
  },
  previous: { date: '2026-10-08' },
} as unknown as SessionContinuation;

function renderCard() {
  return render(
    <MemoryRouter>
      <ContinueSessionCard
        continuation={CONTINUATION}
        systemName="Jita"
        payeeName="Moon Corp"
        typeNames={new Map()}
        busy={false}
        autoContinue={false}
        onContinue={() => {}}
        onChooseOther={() => {}}
        onKeepSeparate={() => {}}
        onAutoContinueChange={() => {}}
      />
    </MemoryRouter>
  );
}

describe('ContinueSessionCard', () => {
  // Issue #3525: the ore names on the same line are links, so the system is too.
  it('links the system in the bold line to Route Safety', () => {
    renderCard();
    const links = screen.getAllByRole('link', { name: 'Jita' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', expect.stringContaining('30000142'));
  });
});
