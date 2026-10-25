import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DrawerFrame,
  OwnedStockBody,
  type NoteMode,
  type PlaceMode,
  type Placement,
  type StockState,
} from './improveOwnedStockParts';

/**
 * Proposal for #5150: in Planning mode Improve counts what the pilot owns, so
 * owned copies cost nothing and the budget caps only what is still to buy.
 * Sample data, not the engine. The base is today's drawer (goal chips, Search
 * settings disclosure, "Now → best found"); every story ticks the launcher row
 * (all 6 owned) and the Ballistic Control row (1 of 2 owned). The base for the
 * questions not being varied is Q1 `Top`, Q2 `Picker`, Q3 `Replace`.
 *
 * - Q1 where "Count what I own" lives: `Q1InSettings` (inside Search settings,
 *   whose summary line gains "minus owned") vs `Q1Top` (always visible, above
 *   the results).
 * - Q2 the place: `Q2Picker` (Appraisal's own sentence, "Count what I own at
 *   [Jita IV-4]", on the one shared pick) vs `Q2Text` ("Counting what you own
 *   at …", naming Appraisal's Minus owned setting and linking to it).
 * - Q3 the row note: `Q3Replace` ("You own 1 of 2 · buy 1 for 113.5M" replaces
 *   the cost line) vs `Q3Beside` (the cost line keeps its place, with an
 *   "Own 1 of 2" `Pill` beside it).
 * - States: `NoneHereTop` / `NoneHereText` (nothing owned at the picked place).
 *   Without the assets scope the control is simply absent, as in today's drawer.
 *
 * The selection summary says "still to buy" against the budget in every story.
 *
 * New components in this mockup: `OwnedStockControl`, `OwnedCostLine`.
 */
function Drawer(props: {
  placement?: Placement;
  placeMode?: PlaceMode;
  note?: NoteMode;
  state?: StockState;
  settingsOpen?: boolean;
}) {
  return (
    <DrawerFrame>
      <OwnedStockBody
        placement={props.placement ?? 'top'}
        placeMode={props.placeMode ?? 'picker'}
        note={props.note ?? 'replace'}
        state={props.state}
        settingsOpen={props.settingsOpen}
      />
    </DrawerFrame>
  );
}

const meta = {
  title: 'mockups/ImproveOwnedStock',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'phone390', isRotated: false } };

const drawer = (props: Parameters<typeof Drawer>[0]): Story => ({
  render: () => <Drawer {...props} />,
});
const onPhone = (story: Story): Story => ({ ...story, globals: phone });

/** @summary Q1 A: "Count what I own" inside Search settings (shown open); the summary line says "minus owned". New component: OwnedStockControl. */
export const Q1InSettings = drawer({ placement: 'settings', settingsOpen: true });
/** @summary Q1 A on a phone. */
export const Q1InSettingsPhone = onPhone(Q1InSettings);
/** @summary Q1 B: the control sits above the results, always visible. */
export const Q1Top = drawer({ placement: 'top' });
/** @summary Q1 B on a phone. */
export const Q1TopPhone = onPhone(Q1Top);

/** @summary Q2 A: Appraisal's sentence, "Count what I own at [Jita IV-4]"; the picker edits the one shared pick. */
export const Q2Picker = drawer({ placeMode: 'picker' });
/** @summary Q2 A on a phone. */
export const Q2PickerPhone = onPhone(Q2Picker);
/** @summary Q2 B: a checkbox, then "Counting what you own at …" naming Appraisal's Minus owned setting, with a Change it link. */
export const Q2Text = drawer({ placeMode: 'text' });
/** @summary Q2 B on a phone. */
export const Q2TextPhone = onPhone(Q2Text);

/** @summary Q3 A: "You own 1 of 2 · buy 1 for 113.5M" replaces the cost line; all owned reads "You own all 6 · nothing to buy". New component: OwnedCostLine. */
export const Q3Replace = drawer({ note: 'replace' });
/** @summary Q3 A on a phone. */
export const Q3ReplacePhone = onPhone(Q3Replace);
/** @summary Q3 B: the cost line stays, an "Own 1 of 2" Pill beside it. */
export const Q3Beside = drawer({ note: 'beside' });
/** @summary Q3 B on a phone. */
export const Q3BesidePhone = onPhone(Q3Beside);

/** @summary Nothing owned at the picked place, with the picker: a warning line says so; every row prices in full. */
export const NoneHereTop = drawer({ state: 'noneHere' });
/** @summary Nothing owned at the place, sentence variant: the warning names Appraisal's setting and links to it. */
export const NoneHereText = drawer({ state: 'noneHere', placeMode: 'text' });
/** @summary Nothing owned, on a phone. */
export const NoneHereTopPhone = onPhone(NoneHereTop);
