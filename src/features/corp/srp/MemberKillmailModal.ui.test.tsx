import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@/i18n';
import type { DoctrinePreview } from '../srpTypes';
import { MemberKillmailModal } from './MemberKillmailModal';
import { isUsablePreview } from './srpMemberModel';

const subject = {
  killmailId: 1,
  killmailHash: 'a'.repeat(40),
  hullTypeId: 24702,
  hullName: 'Hurricane',
  systemName: 'Jita',
  killedAt: Date.now(),
};
const check = { status: 'not-checked' } as unknown as DoctrinePreview['check'];
const full: DoctrinePreview = {
  killmailId: 1,
  hullTypeId: 24702,
  check,
  killedAt: subject.killedAt,
  solarSystemId: 30000142,
  quote: { kind: 'officer', reason: 'officer-decides' },
  hullRule: null,
  values: { killmailValue: null, hullValue: null, fitValue: null },
};

function open(answer: unknown, canFile = true) {
  render(
    <MemberKillmailModal
      subject={subject}
      canFile={canFile}
      busy={false}
      previewDoctrine={async () => answer as DoctrinePreview}
      onFile={() => {}}
      onClose={() => {}}
    />
  );
}

afterEach(cleanup);

describe('MemberKillmailModal', () => {
  it('reads a pre-#5379 answer (no quote, no values) as failed and still lets the pilot file', async () => {
    const old: Partial<DoctrinePreview> = { ...full };
    delete old.quote;
    delete old.values;
    delete old.hullRule;
    open(old);
    expect(await screen.findByText(/Couldn't check this loss/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'File claim' })).toBeTruthy();
  });

  it('renders a not-checked answer with null values', async () => {
    open(full);
    expect(await screen.findByText('An officer will review your claim')).toBeTruthy();
  });

  it('shows an in-modal message when the body throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    open({
      ...full,
      quote: {
        kind: 'amount',
        isk: 1,
        get basis(): never {
          throw new Error('x');
        },
      },
    });
    expect(await screen.findByText(/Couldn't open this killmail/)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
    spy.mockRestore();
  });
});

describe('isUsablePreview', () => {
  it('rejects answers without a quote or values', () => {
    expect(isUsablePreview(null)).toBe(false);
    expect(isUsablePreview({ check })).toBe(false);
    expect(isUsablePreview(full)).toBe(true);
  });
});
