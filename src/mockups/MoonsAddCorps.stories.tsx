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
export const EntryPhone: Story = { ...Entry, ...PHONE };

export const PickCorpsStory: Story = {
  name: 'Pick corps',
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <PickCorps corps={PICKER_CORPS} selected={[]} />
    </>
  ),
};
export const PickCorpsPhone: Story = { ...PickCorpsStory, ...PHONE, name: 'Pick corps (phone)' };

export const PickCorpsTicked: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <PickCorps corps={PICKER_CORPS} selected={PICKER_CORPS.slice(0, 10).map((c) => c.id)} />
    </>
  ),
};

export const Confirm: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <ConfirmBatch corps={CORPS} />
    </>
  ),
};
export const ConfirmPhone: Story = { ...Confirm, ...PHONE };

export const SignIn: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <SignInSequence corps={CORPS} done={3} skipped={[12]} />
    </>
  ),
};
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

export const SignInPhone: Story = { ...SignIn, ...PHONE };

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
export const ResultPhone: Story = { ...Result, ...PHONE };

export const Hidden: Story = {
  render: () => (
    <>
      {page(<MoonsHeader />)}
      <HiddenCorps corps={PICKER_CORPS} />
    </>
  ),
};
