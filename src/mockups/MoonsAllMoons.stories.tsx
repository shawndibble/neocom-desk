import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoonsList } from './moonsAllMoonsList';
import { EmptyHistory, MoonPageA } from './moonsAllMoonsPage';
import { ExtractionsRows, OwnerMoons } from './moonsAllMoonsLinks';
import { EMPTY_MOON } from './moonsAllMoonsFixtures';
import { MoonsChrome, Page } from './moonsAllMoonsShared';
import { MOONS_PARAMS, PHONE_GLOBALS } from './corpTaxBookFormat';

const meta = {
  title: 'mockups/MoonsAllMoons',
  tags: ['!manifest'],
  parameters: { ...MOONS_PARAMS },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PHONE = { globals: PHONE_GLOBALS } as const;

const listPage = (archivedShown = false) => (
  <Page>
    <MoonsChrome tab="moons" />
    <MoonsList archivedShown={archivedShown} />
  </Page>
);

export const ListA: Story = { render: () => listPage() };
export const ListAPhone: Story = { ...ListA, ...PHONE };

export const ListAArchived: Story = { render: () => listPage(true) };

const moonPage = (body: React.ReactNode) => (
  <Page>
    <MoonsChrome tab="moons" />
    {body}
  </Page>
);

export const MoonA: Story = {
  render: () => moonPage(<MoonPageA />),
};
export const MoonAPhone: Story = { ...MoonA, ...PHONE };

export const EmptyHistoryStory: Story = {
  name: 'Empty history',
  render: () => moonPage(<EmptyHistory moon={EMPTY_MOON} live={EMPTY_MOON.live} />),
};
export const EmptyHistoryPhone: Story = {
  ...EmptyHistoryStory,
  ...PHONE,
  name: 'Empty history (phone)',
};

export const LinksIn: Story = {
  render: () => (
    <Page>
      <ExtractionsRows />
      <OwnerMoons />
    </Page>
  ),
};
export const LinksInPhone: Story = { ...LinksIn, ...PHONE };
