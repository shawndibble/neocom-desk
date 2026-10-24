import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { AuditFeed } from './AuditFeed';

const at = Date.parse('2026-10-18T12:00:00Z');

describe('AuditFeed subject (CX-47)', () => {
  it('names the Miner and amount on a Statement entry, and leaves other entries as they were', () => {
    render(
      <AuditFeed
        entries={[
          { id: 'a1', at, by: 1, byName: 'Pilot', action: 'issueStatement', detail: {} },
          { id: 'a2', at, by: 1, byName: 'Pilot', action: 'recordMail', detail: {} },
          {
            id: 'a4',
            at,
            by: 1,
            byName: 'Pilot',
            action: 'recordMail',
            detail: { kind: 'reminder' },
          },
          { id: 'a3', at, by: 1, byName: 'Pilot', action: 'stopReminders', detail: {} },
        ]}
        subject={(e) =>
          e.action === 'issueStatement'
            ? { name: 'Dax Ferrin', amount: 28_390_765 }
            : e.action === 'recordMail'
              ? { name: 'Dax Ferrin' }
              : null
        }
      />
    );
    expect(
      screen.getByText(/issued a Statement to Dax Ferrin, 28,390,765 ISK/)
    ).toBeInTheDocument();
    expect(screen.getByText(/mailed a Statement to Dax Ferrin/)).toBeInTheDocument();
    expect(screen.getByText(/sent a reminder to Dax Ferrin/)).toBeInTheDocument();
    expect(screen.getByText(/stopped reminders/)).toBeInTheDocument();
  });
});
