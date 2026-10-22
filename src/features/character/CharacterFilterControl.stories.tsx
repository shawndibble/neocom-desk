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
import { CharacterFilterControl } from './CharacterFilterControl';

/**
 * @summary The This character / All characters / Corporation picker, in the
 * `PageHeader` `scope` slot it belongs in (decision 20261022-123837).
 */
const meta = {
  title: 'character/CharacterFilterControl',
  component: CharacterFilterControl,
  tags: ['autodocs'],
  args: { activeCharacterId: null, value: 'all', onChange: () => {}, characterCount: 4 },
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

/**
 * The real picker first in the cluster, the same height as the `IconButton`s
 * beside it. `missingNames` draws the warning dot.
 *
 * @summary In a `PageHeader`'s `scope` slot, partial coverage, beside text and icon actions.
 */
export const InPageHeader: Story = {
  args: { missingNames: ['Bob Vale'] },
  render: (args) => (
    <PageHeader
      title="Market orders"
      meta={<DataAgeBadge date={new Date(Date.now() - 12 * 60_000)} />}
      scope={<CharacterFilterControl {...args} />}
      actions={actions}
    />
  ),
};

/** @summary The same header at 390 wide: the picker is a 44px icon box, the row stays one line. */
export const InPageHeaderPhone: Story = {
  ...InPageHeader,
  globals: { viewport: { value: 'phone390', isRotated: false } },
};

/** @summary `loading`: a spinner in the glyph box, the trigger's size unchanged. */
export const Loading: Story = { args: { loading: true } };
