import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db, type MiningTaxAssignmentRecord, type PayeeRecord } from '@/db';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { CorpOverlapNotice } from './CorpOverlapNotice';
import { readOverlapAcks } from './overlapAck';

const ZEO = 45490;
const ME = 1;

const assignment: MiningTaxAssignmentRecord = {
  id: 'a1',
  characterId: ME,
  date: '2026-10-17',
  solarSystemId: 30003838,
  payeeId: 'p1',
  oreLines: [{ typeId: ZEO, quantity: 50_000 }],
  taxPct: 10,
  estimatedValue: 5_000,
  taxOwed: 500,
  status: 'outstanding',
  updatedAt: 1,
};
const payee = { id: 'p1', characterId: ME, name: 'Ashfall' } as PayeeRecord;

const view = {
  id: 'v',
  corporationId: 98000001,
  corpName: 'Brass Meridian',
  characterId: ME,
  date: '2026-10-17',
  solarSystemId: 30003838,
  overlap: { payeeIds: ['p1'], ore: [{ typeId: ZEO, quantity: 43_050 }], paid: false },
} as BookRowView;

const renderNotice = (v: BookRowView = view, onChanged = () => {}) =>
  render(
    <CorpOverlapNotice
      view={v}
      corpName="Brass Meridian"
      everyAssignment={[assignment]}
      payeeById={new Map([['p1', payee]])}
      typeNames={new Map([[ZEO, 'Zeolites']])}
      onChanged={onChanged}
    />
  );

beforeEach(async () => {
  await db.miningTaxAssignments.clear();
  await db.settings.clear();
  await db.miningTaxAssignments.put(assignment);
});

describe('CorpOverlapNotice', () => {
  it('renders nothing without an overlap', () => {
    const { container } = renderNotice({ ...view, overlap: undefined });
    expect(container.textContent).toBe('');
  });

  it('removes only the overlapping ore from the miner entry', async () => {
    let changed = 0;
    renderNotice(view, () => changed++);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Let the corporation bill it' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Take it off my list' }));
    await waitFor(() => expect(changed).toBe(1));
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toEqual([
      { typeId: ZEO, quantity: 6_950 },
    ]);
  });

  it('remembers "I paid it another way" and stops asking', async () => {
    renderNotice();
    await userEvent.click(await screen.findByRole('button', { name: 'I paid it another way' }));
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect([...(await readOverlapAcks())]).toEqual(['98000001:1:2026-10-17:30003838']);
    expect((await db.miningTaxAssignments.get('a1'))?.oreLines).toHaveLength(1);
  });
});
