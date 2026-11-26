import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayeeLedgerPanel } from './PayeeLedgerPanel';
import {
  CORP_BOOK_LEDGER,
  CREDIT_LEDGER,
  EMPTY_LEDGER,
  LEDGER_TYPE_NAMES,
  PERSONAL_LEDGER,
} from './payeeLedgerFixture';

const meta = {
  title: 'miningTax/PayeeLedgerPanel',
  component: PayeeLedgerPanel,
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    onClose: () => {},
    payeeName: 'Bureau of Unified Harvesting',
    source: CORP_BOOK_LEDGER,
    typeNames: LEDGER_TYPE_NAMES,
  },
} satisfies Meta<typeof PayeeLedgerPanel>;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { globals: { viewport: { value: 'mobile1', isRotated: false } } };

export const CorpBook: Story = {};

export const CorpBookPhone: Story = { ...phone };

export const Personal: Story = {
  args: { payeeName: 'Otela Mining Concern', source: PERSONAL_LEDGER },
};

export const InCredit: Story = {
  args: { payeeName: 'Tatara Holdings', source: CREDIT_LEDGER },
};

export const Empty: Story = {
  args: { payeeName: 'New Payee', source: EMPTY_LEDGER },
};

export const Loading: Story = { args: { source: null } };
