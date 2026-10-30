import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppraisalLiveMockup } from './appraisalLiveParts';

/**
 * Proposal for #5591: Appraisal rows go live. Today's page is the first story.
 * Three ways to show progress, all text ("Checking live prices 23 / 60") plus a
 * thin bar, gone when every row is live:
 * A = bar on its own strip under the header, mark is a word beside the price.
 * B = bar hugs the card's top edge, mark is an icon (word for screen readers).
 * C = bar inline next to the text in the header, mark is a pill in the Item cell.
 * Compare Hubs shows the same line and bar while the other four hubs load.
 *
 * New components in this mockup: none drawn dashed. The status is text plus the
 * existing `ProgressBar` (size xs); row marks are inline text or an icon, so
 * dashed labels would only distort the footprint being judged. Sample data; the
 * page frame stands in for the real Appraisal page, built from real primitives.
 */
const meta = {
  title: 'mockups/Appraisal Live Prices',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/market/appraisal' } },
  render: () => <AppraisalLiveMockup variant="today" scene="done" />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today: Appraisal result on Fuzzwork prices, no live status. */
export const Today: Story = {};

/** @summary Variant A, 23 of 60 rows live: bar on its own strip under the header; "cached" word beside dimmed prices; one failed row says Fuzzwork. */
export const AProgress: Story = {
  render: () => <AppraisalLiveMockup variant="a" scene="progress" />,
};
/** @summary Variant A finished: "Live prices · checked 14 s ago", bar gone; the failed row keeps its Fuzzwork mark. */
export const ADone: Story = { render: () => <AppraisalLiveMockup variant="a" scene="done" /> };
/** @summary Variant A, Compare Hubs open while Dodixie, Rens and Hek load. */
export const ACompare: Story = {
  render: () => <AppraisalLiveMockup variant="a" scene="compare" />,
};
/** @summary Variant A progress on a phone. */
export const APhone: Story = {
  globals: phone,
  render: () => <AppraisalLiveMockup variant="a" scene="progress" />,
};

/** @summary Variant B, 23 of 60 live: 4px bar hugging the card's top edge; icon marks (clock = cached, warning = Fuzzwork). */
export const BProgress: Story = {
  render: () => <AppraisalLiveMockup variant="b" scene="progress" />,
};
/** @summary Variant B finished: age line only. */
export const BDone: Story = { render: () => <AppraisalLiveMockup variant="b" scene="done" /> };
/** @summary Variant B, Compare Hubs loading: bar on the cards' top edge. */
export const BCompare: Story = {
  render: () => <AppraisalLiveMockup variant="b" scene="compare" />,
};
/** @summary Variant B progress on a phone. */
export const BPhone: Story = {
  globals: phone,
  render: () => <AppraisalLiveMockup variant="b" scene="progress" />,
};

/** @summary Variant C, 23 of 60 live: short bar inline after the text in the header; "cached" / "Fuzzwork" pill in the Item cell. */
export const CProgress: Story = {
  render: () => <AppraisalLiveMockup variant="c" scene="progress" />,
};
/** @summary Variant C finished: age line only. */
export const CDone: Story = { render: () => <AppraisalLiveMockup variant="c" scene="done" /> };
/** @summary Variant C, Compare Hubs loading: text and short bar inline. */
export const CCompare: Story = {
  render: () => <AppraisalLiveMockup variant="c" scene="compare" />,
};
/** @summary Variant C progress on a phone. */
export const CPhone: Story = {
  globals: phone,
  render: () => <AppraisalLiveMockup variant="c" scene="progress" />,
};
