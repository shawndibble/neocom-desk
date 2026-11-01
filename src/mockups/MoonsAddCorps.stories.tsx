import type { Meta, StoryObj } from '@storybook/react-vite';
import { NewComponent } from './NewComponent';
import {
  ConfirmBatch,
  CorpStatusList,
  HiddenCorps,
  MoonsHeader,
  NewCorpBanner,
  PickCorps,
  SignInSequence,
} from './moonsAddCorpsParts';
import { CORPS, NEW_CORP, PICKER_CORPS, RESULT_CORPS } from './moonsAddCorpsFixtures';

/**
 * Corp Tax Book › Moons: "Add my other corps". A CEO who owns many alt corps
 * (one per Athanor) connects them all to the main corp's book without invite
 * links. Decisions: docs/design/mockups/moons-add-my-corps/README.md.
 *
 * Story order is the user's order: entry, pick, confirm, sign-in sequence,
 * result, hidden corps.
 *
 * New components in this mockup: `NewCorpBanner`, `PickCorps`, `ConfirmBatch`,
 * `SignInSequence`, `CorpStatusList`, `HiddenCorps` (a dialog), and the "Add my other
 * corps" header button's placement. Everything else is an existing primitive.
 * The three dialogs (`PickCorps`, `ConfirmBatch`, `SignInSequence`) are named
 * here rather than dashed-boxed: a dashed label would sit inside the modal chrome.
 * `NewCorpBanner` is hand-built because no existing banner takes three actions.
 */
const meta = {
  title: 'mockups/MoonsAddCorps',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/corp/moons' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { globals: { viewport: { value: 'mobile1', isRotated: false } } } as const;

const page = (children: React.ReactNode) => (
  <div className="mx-auto max-w-page space-y-4 px-4 pt-4">{children}</div>
);

/** @summary Entry: the header button plus the one-time "New corp found" banner. New component: NewCorpBanner. */
export const Entry: Story = {
  render: () =>
    page(
      <>
        <MoonsHeader />
        <NewComponent name="NewCorpBanner">
          <NewCorpBanner corp={NEW_CORP} />
        </NewComponent>
      </>
    ),
};
/** @summary Entry in the phone shell. */
export const EntryPhone: Story = { ...Entry, ...PHONE };

/** @summary Step 1: every corp he is CEO of, nothing ticked, with Hidden corps in the footer. New component: PickCorps. */
export const PickCorpsStory: Story = {
  name: 'Pick corps',
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <PickCorps corps={PICKER_CORPS} selected={[]} />
    </>
  ),
};
/** @summary Pick corps in the phone shell. */
export const PickCorpsPhone: Story = { ...PickCorpsStory, ...PHONE, name: 'Pick corps (phone)' };

/** @summary Step 1 with ten ticked, ready to continue. */
export const PickCorpsTicked: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <PickCorps corps={PICKER_CORPS} selected={PICKER_CORPS.slice(0, 10).map((c) => c.id)} />
    </>
  ),
};

/** @summary Step 2: one confirm for the batch with How far back. New component: ConfirmBatch. */
export const Confirm: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <ConfirmBatch corps={CORPS} />
    </>
  ),
};
/** @summary Confirm in the phone shell. */
export const ConfirmPhone: Story = { ...Confirm, ...PHONE };

/** @summary Step 3: guided sign-in, corp 4 of 12, with one earlier corp skipped. New component: SignInSequence. */
export const SignIn: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <SignInSequence corps={CORPS} done={3} skipped={[12]} />
    </>
  ),
};
/** @summary Back from EVE: the last corp is confirmed and the dialog is on corp 5 of 12. */
export const SignInBackFromEve: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <SignInSequence
        corps={CORPS}
        done={4}
        skipped={[12]}
        outcome={{ kind: 'connected', corp: 'Tallow Station Co' }}
      />
    </>
  ),
};

/** @summary Signed in as the wrong character: nothing connects, the same corp stays current. */
export const SignInWrongCharacter: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <SignInSequence
        corps={CORPS}
        done={3}
        skipped={[12]}
        outcome={{ kind: 'wrong-character', signedInAs: 'Dax Orlen' }}
      />
    </>
  ),
};

/** @summary Guided sign-in in the phone shell. */
export const SignInPhone: Story = { ...SignIn, ...PHONE };

/** @summary After the run: Needs you (sign-in, role, own book, gone quiet) above the Moon owners list with Yours pills. New component: CorpStatusList. */
export const Result: Story = {
  render: () =>
    page(
      <>
        <MoonsHeader />
        <NewComponent name="CorpStatusList">
          <CorpStatusList corps={RESULT_CORPS} />
        </NewComponent>
      </>
    ),
};
/** @summary Result in the phone shell. */
export const ResultPhone: Story = { ...Result, ...PHONE };

/** @summary Hidden corps, opened from the picker footer; nothing shows on the page itself. New component: HiddenCorps. */
export const Hidden: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <HiddenCorps corps={PICKER_CORPS} />
    </>
  ),
};
