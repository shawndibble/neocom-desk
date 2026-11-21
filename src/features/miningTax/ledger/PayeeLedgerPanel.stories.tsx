import type { Meta, StoryObj } from '@storybook/react-vite';
import { PayeeLedgerPanel } from './PayeeLedgerPanel';
import {
  CORP_BOOK_LEDGER,
  CREDIT_LEDGER,
  EMPTY_LEDGER,
  LEDGER_TYPE_NAMES,
  PERSONAL_LEDGER,
} from './payeeLedgerFixture';

/**
 * A Payee ledger, as the Moon Mining Tax tab opens it from a Payee: every charge, payment,
 * write-off and late notice with a running balance, under "Owes" or "Paid through".
 */
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

/** @summary A Corp Tax Book Payee: history, an Adjustment, part payments, a late notice and a write-off. */
export const CorpBook: Story = {};

/** @summary The Corp Tax Book Payee on a phone: the rows stack into cards. */
export const CorpBookPhone: Story = { ...phone };

/** @summary A personal Payee: mined days and a payment from the pilot's wallet, no notices. */
export const Personal: Story = {
  args: { payeeName: 'Otela Mining Concern', source: PERSONAL_LEDGER },
};

/** @summary A Payee paid ahead: Paid through, with credit. */
export const InCredit: Story = {
  args: { payeeName: 'Tatara Holdings', source: CREDIT_LEDGER },
};

/** @summary A Payee with nothing billed yet. */
export const Empty: Story = {
  args: { payeeName: 'New Payee', source: EMPTY_LEDGER },
};

/** @summary While the Running account loads. */
export const Loading: Story = { args: { source: null } };
