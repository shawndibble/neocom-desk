import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  DataAgeBadge,
  DropdownMenuItem,
  HeaderMoreMenu,
  IconButton,
  PageHeader,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { db } from '@/db';
import { CharacterFilterControl, type CharacterScopeChoice } from './CharacterFilterControl';
import { MINUTE_MS } from '@/lib/age';

const PILOT_IDS = [90000001, 2112625428, 91316135, 95465499, 96180548, 1338057886];

function seedRoster(count: number) {
  return async () => {
    await db.characters.clear();
    await db.characters.bulkPut(
      PILOT_IDS.slice(0, count).map((characterId, index) => ({
        characterId,
        name: `Pilot ${index + 1}`,
        ownerHash: `story-${index}`,
        addedAt: index,
        corporationId: 1000035,
      }))
    );
    return {};
  };
}

const meta = {
  title: 'character/CharacterFilterControl',
  component: CharacterFilterControl,
  tags: ['autodocs'],
  args: { activeCharacterId: PILOT_IDS[0], value: 'all', onChange: () => {}, characterCount: 4 },
  loaders: [seedRoster(4)],
} satisfies Meta<typeof CharacterFilterControl>;

export default meta;
type Story = StoryObj<typeof meta>;

const actions = (
  <>
    <Button variant="ghost">Export</Button>
    <IconButton label="Refresh" icon={<Icon.Refresh />} />
    <HeaderMoreMenu>
      <DropdownMenuItem>Page settings…</DropdownMenuItem>
      <DropdownMenuItem>Column presets…</DropdownMenuItem>
    </HeaderMoreMenu>
  </>
);

export const InPageHeader: Story = {
  args: { missingNames: ['Pilot 2'] },
  render: (args) => (
    <PageHeader
      title="Market orders"
      meta={<DataAgeBadge date={new Date(Date.now() - 12 * MINUTE_MS)} />}
      scope={<CharacterFilterControl {...args} />}
      actions={actions}
    />
  ),
};

export const InPageHeaderPhone: Story = {
  ...InPageHeader,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

export const InPageHeaderTablet: Story = {
  ...InPageHeader,
  globals: { viewport: { value: 'tablet768', isRotated: false } },
};

export const ThisCharacter: Story = { args: { value: 'current' } };

export const TwoCharacters: Story = {
  args: { characterCount: 2 },
  loaders: [seedRoster(2)],
};

export const ThreeCharacters: Story = {
  args: { characterCount: 3 },
  loaders: [seedRoster(3)],
};

export const SixCharacters: Story = {
  args: { characterCount: 6 },
  loaders: [seedRoster(6)],
};

export const SixCharactersPhone: Story = {
  ...SixCharacters,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

export const Corporation: Story = {
  render: (args) => (
    <CharacterFilterControl<CharacterScopeChoice>
      {...args}
      corporation
      value="corporation"
      onChange={() => {}}
    />
  ),
};

export const Partial: Story = { args: { missingNames: ['Pilot 2'] } };

export const Loading: Story = { args: { loading: true } };

export const WithCorporations: Story = {
  args: {
    value: 'corp:98000002',
    corporations: [
      { id: 98000001, name: 'Amarr Control Tech' },
      { id: 98000002, name: 'Acme Mining Co' },
    ],
  },
};

export const Mixed: Story = { args: { mixed: true } };
