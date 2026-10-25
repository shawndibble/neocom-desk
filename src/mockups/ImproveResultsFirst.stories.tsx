import type { Meta, StoryObj } from '@storybook/react-vite';
import { FitPageEntries, type EntryMode } from './improveEntryParts';
import {
  DrawerFrame,
  ImproveBody,
  type GoalsMode,
  type HeaderMode,
  type SettingsMode,
} from './improveResultsFirstParts';

/**
 * Proposal for #5104: Improve's drawer leads with results. Four open questions,
 * each a pair or trio of stories; every story has a `Phone` twin (390 wide, bottom
 * sheet) that must show at least one result on its first screen. Sample data,
 * not the engine. The base for the questions not being varied is Q1 `Summary`,
 * Q2 `Relevant`, Q3 `Top`.
 *
 * - Q1 settings: `Q1Summary` (one-line summary + Edit after the first search) vs
 *   `Q1Disclosure` ("Search settings" disclosure from the start).
 * - Q2 goals: `Q2Relevant` (role goals + "More goals", disabled ones say why inline)
 *   vs `Q2AllGrouped` (all 15 by role, goal block folds to the picked goal). The
 *   `...Open` stories show the picker expanded. "Also try…" is now "Rigs and officer
 *   modules"; every goal has a "scores …" line.
 * - Q3 "Now → best found": `Q3Top` (above results) vs `Q3InSummary` (in the sticky
 *   selection summary).
 * - Q4 entries: `Q4Header` (text action in the stats column header), `Q4Slot`
 *   (empty slot's menu), `Q4Both`.
 *
 * New components in this mockup: `SettingsSummaryStrip`, `SearchSettingsDisclosure`,
 * `MoreGoalsList`, `GroupedGoalList`, `NowBestHeader`, `StatsImproveAction`,
 * `EmptySlotMenu`.
 *
 * Mobbin evidence per pick is in docs/design/mockups/improve-results-first/README.md.
 */
function Drawer({
  settings = 'collapse',
  goals = 'relevant',
  header = 'top',
  goalsOpen = false,
}: {
  settings?: SettingsMode;
  goals?: GoalsMode;
  header?: HeaderMode;
  goalsOpen?: boolean;
}) {
  return (
    <DrawerFrame>
      <ImproveBody settings={settings} goals={goals} header={header} goalsOpen={goalsOpen} />
    </DrawerFrame>
  );
}

const meta = {
  title: 'mockups/ImproveResultsFirst',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } };

const drawer = (props: Parameters<typeof Drawer>[0]): Story => ({
  render: () => <Drawer {...props} />,
});
const entry = (mode: EntryMode): Story => ({ render: () => <FitPageEntries entry={mode} /> });
const onPhone = (story: Story): Story => ({ ...story, globals: phone });

/** @summary Q1 A: after the first search, goal and settings fold into one summary line with Edit. New component: SettingsSummaryStrip. */
export const Q1Summary = drawer({ settings: 'collapse' });
/** @summary Q1 A on a phone: summary line, then the first result on the first screen. */
export const Q1SummaryPhone = onPhone(Q1Summary);
/** @summary Q1 B: goals stay visible; a "Search settings" disclosure sits there from the start. New component: SearchSettingsDisclosure. */
export const Q1Disclosure = drawer({ settings: 'disclosure' });
/** @summary Q1 B on a phone. */
export const Q1DisclosurePhone = onPhone(Q1Disclosure);

/** @summary Q2 A: only the hull's role goals as chips, "More goals" lists the rest with the reason inline. New component: MoreGoalsList. */
export const Q2Relevant = drawer({ settings: 'disclosure', goals: 'relevant' });
/** @summary Q2 A on a phone. */
export const Q2RelevantPhone = onPhone(Q2Relevant);
/** @summary Q2 A with More goals open: every goal says what it scores or why it is off. */
export const Q2RelevantOpen = drawer({
  settings: 'disclosure',
  goals: 'relevant',
  goalsOpen: true,
});
/** @summary Q2 A, More goals open, on a phone. */
export const Q2RelevantOpenPhone = onPhone(Q2RelevantOpen);
/** @summary Q2 B: all 15 goals grouped by role; the block folds to the picked goal after choosing. New component: GroupedGoalList. */
export const Q2AllGrouped = drawer({ settings: 'disclosure', goals: 'all' });
/** @summary Q2 B on a phone. */
export const Q2AllGroupedPhone = onPhone(Q2AllGrouped);
/** @summary Q2 B with the grouped picker open: results fall below the fold, the cost of showing everything. */
export const Q2AllGroupedOpen = drawer({ settings: 'disclosure', goals: 'all', goalsOpen: true });
/** @summary Q2 B, picker open, on a phone. */
export const Q2AllGroupedOpenPhone = onPhone(Q2AllGroupedOpen);

/** @summary Q3 A: "Now → best found" (DPS 90.7 → up to 128) at the top of the results. New component: NowBestHeader. */
export const Q3Top = drawer({ header: 'top' });
/** @summary Q3 A on a phone. */
export const Q3TopPhone = onPhone(Q3Top);
/** @summary Q3 B: the same figures live in the sticky selection summary. */
export const Q3InSummary = drawer({ header: 'summary' });
/** @summary Q3 B on a phone. */
export const Q3InSummaryPhone = onPhone(Q3InSummary);

/** @summary Q4 A: "Improve…" text action in the stats column header. New component: StatsImproveAction. */
export const Q4Header = entry('header');
/** @summary Q4 A on a phone. */
export const Q4HeaderPhone = onPhone(Q4Header);
/** @summary Q4 B: an empty slot's menu offers "Improve… fill this slot". New component: EmptySlotMenu. */
export const Q4Slot = entry('slot');
/** @summary Q4 B on a phone. */
export const Q4SlotPhone = onPhone(Q4Slot);
/** @summary Q4 C: both entry points. */
export const Q4Both = entry('both');
/** @summary Q4 C on a phone. */
export const Q4BothPhone = onPhone(Q4Both);
