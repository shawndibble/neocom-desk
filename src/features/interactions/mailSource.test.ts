import { describe, expect, it } from 'vitest';
import type { MailHeader } from '@/esi/endpoints/mail';
import { mailInteractions } from './mailSource';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}|${Object.values(opts).join(',')}` : key;
const OTHER = 500;
const ME = 1;

const header = (over: Partial<MailHeader>): MailHeader => ({
  mail_id: 10,
  timestamp: '2026-03-01T12:00:00Z',
  ...over,
});

describe('mailInteractions', () => {
  it('maps mail from the other player to a viewer Character', () => {
    const [row] = mailInteractions(
      [{ characterId: ME, headers: [header({ from: OTHER, subject: 'Hello' })] }],
      OTHER,
      'Mira',
      t
    );
    expect(row).toMatchObject({
      id: `mail-${ME}-10`,
      kind: 'mail',
      type: 'interactions.type.mail',
      title: 'Hello',
      detail: 'interactions.mail.from|Mira',
      characterId: ME,
      to: `/mail?open=10&owner=${ME}`,
      at: Date.parse('2026-03-01T12:00:00Z'),
    });
    expect(row.isk).toBeUndefined();
  });

  it('maps mail a viewer Character sent to the other player', () => {
    const rows = mailInteractions(
      [
        {
          characterId: ME,
          headers: [
            header({
              from: ME,
              subject: 'Re',
              recipients: [{ recipient_id: OTHER, recipient_type: 'character' }],
            }),
          ],
        },
      ],
      OTHER,
      'Mira',
      t
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].detail).toBe('interactions.mail.to|Mira');
  });

  it('skips unrelated mail, mailing-list ids that collide, and undated headers', () => {
    const rows = mailInteractions(
      [
        {
          characterId: ME,
          headers: [
            header({ mail_id: 1, from: 999 }),
            header({
              mail_id: 2,
              from: ME,
              recipients: [{ recipient_id: OTHER, recipient_type: 'mailing_list' }],
            }),
            header({ mail_id: 3, from: OTHER, timestamp: undefined }),
          ],
        },
      ],
      OTHER,
      'Mira',
      t
    );
    expect(rows).toEqual([]);
  });

  it('uses a placeholder for an empty subject', () => {
    const [row] = mailInteractions(
      [{ characterId: ME, headers: [header({ from: OTHER })] }],
      OTHER,
      'Mira',
      t
    );
    expect(row.title).toBe('interactions.mail.noSubject');
  });
});
