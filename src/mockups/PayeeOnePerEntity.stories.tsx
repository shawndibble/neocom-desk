import type { Meta, StoryObj } from '@storybook/react-vite';
import type { PayeeRecord } from '@/db';
import { PayeeManagerDialog } from '@/features/miningTax/PayeeManagerDialog';

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

export const Grouped: Story = {
  render: () => <Dialog payees={[rec('a', 1), rec('b', 2), rec('c', 3), other]} />,
};

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

export const TermsDifferPhone: Story = {
  ...TermsDiffer,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
