import type { Meta, StoryObj } from '@storybook/react-vite';
import { recordApproval, startFinishSetup, type Approval } from '@/engine/character/finishSetup';
import { FinishSetupDialog } from './FinishSetupDialog';

const ITEMS: Approval[] = [
  {
    kind: 'moon',
    corporationId: 98000011,
    corporationName: 'Ironvale Reach',
    collectorCorporationId: 98000000,
    editorCharacterId: 90000000,
  },
  { kind: 'alerts' },
];
const fresh = () => startFinishSetup({ characterId: 90000001, name: 'Kestrel Vane', items: ITEMS });
const afterMoon = () => recordApproval(fresh(), { kind: 'moon', result: 'done' });
const phone = { globals: { viewport: { value: 'phone390', isRotated: false } } } as const;

const meta = {
  title: 'character/FinishSetupDialog',
  component: FinishSetupDialog,
  parameters: { layout: 'fullscreen' },
  args: {
    chain: fresh(),
    offering: true,
    onContinue: () => Promise.resolve(),
    onApprove: () => Promise.resolve(),
    onNotNow: () => {},
    onClose: () => {},
    onAddAnother: () => {},
  },
} satisfies Meta<typeof FinishSetupDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Offer1440: Story = {};

export const Offer390: Story = { ...phone };

export const Running1440: Story = { args: { chain: afterMoon(), offering: false } };

export const Running390: Story = { args: { chain: afterMoon(), offering: false }, ...phone };

export const WrongCharacter: Story = {
  args: {
    chain: recordApproval(afterMoon(), {
      kind: 'alerts',
      result: 'wrong-character',
      signedInAs: 'Dax Orlen',
    }),
    offering: false,
  },
};

export const Done: Story = {
  args: {
    chain: recordApproval(afterMoon(), { kind: 'alerts', result: 'done' }),
    offering: false,
  },
};
