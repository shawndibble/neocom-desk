import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PayeeRecord } from '@/db';
import { PayeeManagerDialog } from '@/features/miningTax/PayeeManagerDialog';

/**
 * One Payee per corporation or player (#6308): Manage Payees lists a recipient once, however many
 * of the pilot's characters hold a record of it. A merged row says how many characters use it; when
 * their terms differ it shows the choice as one button per distinct terms, never silently picking.
 *
 * No new components: the real `PayeeManagerDialog`, built from existing primitives.
 */
const corp = { entityId: 98_000_001, entityKind: 'corporation' as const };
const alts = [
  { characterId: 1, characterName: 'Miner One' },
  { characterId: 2, characterName: 'Miner Two' },
  { characterId: 3, characterName: 'Miner Three' },
];

const rec = (id: string, characterId: number, extra: Partial<PayeeRecord> = {}): PayeeRecord => ({
  id,
  characterId,
  name: 'Bureau of Unified Harvesting',
  defaultTaxPct: 10,
  updatedAt: 1,
  ...corp,
  ...extra,
});

function Dialog({ payees }: { payees: PayeeRecord[] }) {
  const byCharacter = new Map<number, PayeeRecord[]>(alts.map((c) => [c.characterId, []]));
  for (const p of payees) byCharacter.get(p.characterId)?.push(p);
  return (
    <PayeeManagerDialog
      open
      onClose={() => {}}
      characters={alts}
      payeesByCharacter={byCharacter}
      initialCharacterId={1}
      onChanged={() => {}}
      owedByPayee={new Map([['a', { amount: 41_200_000, count: 6, moving: 6 }]])}
    />
  );
}

const other = rec('z', 1, {
  name: 'Star Tail Industries',
  entityId: 98_000_002,
  defaultTaxPct: 8,
});

const meta = {
  title: 'mockups/PayeeOnePerEntity',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Three characters, one corporation: one row, "Used by 3 characters". */
export const Grouped: Story = {
  render: () => <Dialog payees={[rec('a', 1), rec('b', 2), rec('c', 3), other]} />,
};

/** @summary The merged records bill differently: the pilot picks the terms all of them use. */
export const TermsDiffer: Story = {
  render: () => (
    <Dialog
      payees={[
        rec('a', 1),
        rec('b', 2, { defaultTaxPct: 7 }),
        rec('c', 3, { defaultTaxPct: 7, hubId: 'amarr' }),
        other,
      ]}
    />
  ),
};

/** @summary The differing-terms state in the phone shell. */
export const TermsDifferPhone: Story = {
  ...TermsDiffer,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
