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

/** @summary "Finish setting up {character}": a Character's remaining EVE approvals after a sign-in lands. */
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

/** @summary The offer at 1440: moon book and closed-app alerts, both ticked, Continue and Not now. */
export const Offer1440: Story = {};

/** @summary The offer at 390. */
export const Offer390: Story = { ...phone };

/** @summary Back from EVE: the moon book is done, alerts is next. */
export const Running1440: Story = { args: { chain: afterMoon(), offering: false } };

/** @summary Back from EVE at 390. */
export const Running390: Story = { args: { chain: afterMoon(), offering: false }, ...phone };

/** @summary Approved as another character: nothing approved, the same item again. */
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

/** @summary All done: offers the next character. */
export const Done: Story = {
  args: {
    chain: recordApproval(afterMoon(), { kind: 'alerts', result: 'done' }),
    offering: false,
  },
};
