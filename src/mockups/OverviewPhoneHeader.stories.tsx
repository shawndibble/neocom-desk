import type { Meta, StoryObj } from '@storybook/react-vite';
import { Link } from 'react-router-dom';
import { AlertsBell, CharacterAvatar, DropdownMenuItem, HeaderMoreMenu } from '@/components/ui';
import {
  focusRingClassName,
  interactiveClassName,
  tappableRowClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { cx } from '@/lib/cx';
import { OverviewSubNav } from '@/features/character/OverviewSubNav';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { usePageScopeControl } from '@/features/overview/widgets/usePageScopeControl';
import { Overview } from '@/routes/Overview';
import { SAMPLE_ACTIVE_CHARACTER } from '@/storybook/sampleData';
import { NewComponent } from './NewComponent';

function ProposedHeader() {
  const scope = usePageScopeControl();
  return (
    <div className="mx-auto max-w-page space-y-3">
      <NewComponent name="OverviewPhoneHeader">
        <header className="space-y-3">
          <div className="flex items-start gap-3">
            <CharacterAvatar characterId={SAMPLE_ACTIVE_CHARACTER.characterId} size="lg" priority />
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold tracking-widest uppercase wrap-break-word">
                Mero Otichoda
              </h1>
              <p className="text-xs text-text-dim">
                <span className="underline-offset-2 hover:underline">
                  Bureau of Unified Harvesting
                </span>
                {' · '}
                <span className="underline-offset-2 hover:underline">Plenitude Alliance</span>
              </p>
              <p className="mt-1 text-xs text-text-dim">
                <b className="font-semibold text-text">Sightseer</b> · 725 points
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-center gap-1">
              <AlertsBell showWhenEmpty />
              <HeaderMoreMenu>
                <DropdownMenuItem>
                  <Icon.EditBoard aria-hidden="true" />
                  Customize
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Icon.Refresh aria-hidden="true" />
                  Refresh all widgets
                  <span className="ml-auto pl-3 text-xs text-text-dim">2m ago</span>
                </DropdownMenuItem>
              </HeaderMoreMenu>
            </div>
          </div>
          <Link
            to="/skills"
            className={cx(
              'flex items-center gap-2 border-t border-line pt-1 text-sm whitespace-nowrap',
              tappableRowClassName,
              interactiveClassName,
              focusRingClassName
            )}
          >
            <b className="font-semibold tabular-nums">1d 2h</b>
            <span className="min-w-0 truncate text-text-dim">Next skill finishes</span>
            <Icon.GoTo aria-hidden="true" className="ml-auto shrink-0 text-text-dim" />
          </Link>
        </header>
      </NewComponent>
      <OverviewSubNav />
      {scope && (
        <NewComponent name="Scope row above the widgets">
          <CharacterFilterControl {...scope} />
        </NewComponent>
      )}
    </div>
  );
}

/**
 * New components in this mockup: OverviewPhoneHeader (bell top-right with ⋮ under it, affiliations on one dim line, Next as one full-width row, scope picker moved above the widgets).
 */
const meta = {
  title: 'mockups/OverviewPhoneHeader',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/overview' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today's phone header, for comparison. */
export const Today: Story = { globals: phone, render: () => <Overview /> };

/** @summary Proposed phone header: bell in the corner, ⋮ beneath, one dim affiliation line, Next as a quiet row. */
export const Proposed: Story = { globals: phone, render: () => <ProposedHeader /> };
