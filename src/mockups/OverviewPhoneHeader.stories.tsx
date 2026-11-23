import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertsBell, Button, CharacterAvatar, IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';
import { Overview } from '@/routes/Overview';

/**
 * Overview header on a phone: today versus proposed (docs/design/mockups/README.md).
 *
 * Proposed: the name gets a full-width line (it wraps instead of truncating),
 * a smaller portrait, no second avatar (the Character switcher is the rail
 * footer's and the palette's job elsewhere; here the portrait would open it),
 * Customize folded into the more menu beside the bell, the Next deadline as a
 * quiet one-sentence row, and the data age off the tab row.
 *
 * New components in this mockup: `IdentityBlock` (the dashed block holding
 * portrait, name, corp line and Next row). Everything else is an existing
 * primitive or the page itself; the widgets below are the real Overview.
 */
const meta = {
  title: 'mockups/OverviewPhoneHeader',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/overview' } },
  globals: { viewport: { value: 'mobile1', isRotated: false } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Today's Overview in the phone shell. */
export const TodayPhone: Story = {
  render: () => <Overview />,
};

/**
 * Hides the real page's own header and tab row (its first two children) so
 * the proposal replaces them while the real widgets stay below. Positional:
 * it assumes `Overview`'s Board still opens with `CharacterHeader` then
 * `OverviewSubNav`. The name below is a long placeholder, to show wrapping.
 */
const HIDE_REAL_HEADER = '[&>div>*:nth-child(-n+2)]:hidden';

function ProposedHeader() {
  return (
    <div className="mx-auto max-w-page space-y-2 pt-3">
      <NewComponent name="IdentityBlock">
        <div className="flex items-start gap-3">
          <button type="button" aria-label="Switch character" className="shrink-0">
            <CharacterAvatar characterId={SAMPLE_ACTIVE_CHARACTER.characterId} size="md" alt="" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg leading-tight font-semibold tracking-wider uppercase">
              Mero Otic Valkyrie
            </h1>
            <p className="truncate text-xs text-text-dim">Bureau of Unified Citizens</p>
            <p className="truncate text-xs text-text-dim">Sightseer · 595 points</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <AlertsBell showWhenEmpty />
            <IconButton label="More" icon={<Icon.More size={Icon.ICON_SIZE.md} />} />
          </div>
        </div>
        <Button className="mt-3 w-full justify-between" size="md">
          <span className="flex items-center gap-2 text-sm tracking-normal normal-case">
            <Icon.Skills size={Icon.ICON_SIZE.md} aria-hidden="true" />
            <span>
              Next skill finishes in <b className="font-semibold tabular-nums">2d 11h</b>
            </span>
          </span>
          <Icon.GoTo size={Icon.ICON_SIZE.md} aria-hidden="true" />
        </Button>
      </NewComponent>
      <OverviewSubNav />
    </div>
  );
}

/** @summary Proposed phone header: name on its own line, one quiet Next row, controls trimmed to bell and more, data age off the tab row. New component: IdentityBlock. */
export const ProposedPhone: Story = {
  render: () => (
    <>
      <ProposedHeader />
      <div className={HIDE_REAL_HEADER}>
        <Overview />
      </div>
    </>
  ),
};
