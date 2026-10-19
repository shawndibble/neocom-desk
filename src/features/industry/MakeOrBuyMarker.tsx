import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { cx } from '@/lib/cx';
import { BUILD_GLYPH, makeOrBuyLabel, makeOrBuyReason, makeOrBuyVerdict } from './makeOrBuyText';

/**
 * The advice as a tooltip bubble: the suggestion on its own line, bold, the
 * reasoning under it, and — where the trigger is the toggle rather than the
 * advisory glyph — what clicking will do.
 *
 * The suggestion leads because it is the only part a player needs every time
 * — "which of these two should I be doing" — and it used to be inferable only
 * from which of six phrasings the sentence happened to start with. Bold and
 * on its own line, it survives a glance; the prices below it are there for
 * when the answer is close enough to want checking.
 *
 * `action` is the row's *current* state inverted, never the suggestion: a row
 * already being built is clicked to go back to buying, whatever the advice
 * says. Keeping the two apart is the whole point of spelling the click out —
 * "Suggestion: Build It" over "Click to Buy" is a row that is already right,
 * which is exactly the case a single line of text used to render as a
 * contradiction.
 */
export function MakeOrBuyTooltip({
  advice,
  remaining,
  action,
}: {
  /** Omitted where there is no verdict — an unpriced recipe input, or nothing that produces this. */
  advice?: MakeOrBuy;
  remaining: number;
  /** What a click does. Omitted on the advice-only marker, which has nothing to click. */
  action?: 'build' | 'buy';
}) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col gap-1">
      {advice && (
        <>
          <span className="font-semibold">{makeOrBuyVerdict(advice, t)}</span>
          <span>{makeOrBuyReason(advice, remaining, t)}</span>
        </>
      )}
      {action && (
        <span>{t(`industry.makeOrBuy.${action === 'build' ? 'clickBuild' : 'clickBuy'}`)}</span>
      )}
    </span>
  );
}

/**
 * The row's make-or-buy verdict (GLOSSARY.md round 29). Distinct glyphs
 * rather than one glyph in several tones: the verdict has to survive greyscale
 * and a screen reader (docs/DESIGN.md §7), so the shape carries it and the
 * label spells it out with both prices. Deliberately not a control — it has
 * nothing to click, so it takes no tab stop from the sourcing inputs on the
 * same row. (A material something here can build gets the interactive
 * version of this same glyph instead — see the materials column below.)
 *
 * The house `Tooltip` reads that same label on hover or touch-and-hold —
 * never a bare `title`, which every other pointer-revealed hint in the app
 * already avoids (docs/DESIGN.md's component table). `Tooltip`'s trigger
 * only needs `asChild`, not focusability: Radix reveals it on pointer
 * movement regardless of tab order, and only wires up its `onFocus` handler,
 * which never fires without a `tabIndex` to focus onto. So wrapping the span
 * costs nothing of the "no tab stop" rule above — there's a test pinning it.
 */
export function MakeOrBuyMarker({
  advice,
  remaining,
  badge = false,
}: {
  advice: MakeOrBuy;
  remaining: number;
  /**
   * A short word in a pill ("PI", "Buy") instead of the glyph — the phone
   * card's form, where there is no hover to explain a bare planet or cart.
   */
  badge?: boolean;
}) {
  const { t } = useTranslation();
  const building = advice.verdict === 'build';
  const label = makeOrBuyLabel(advice, remaining, t);
  // Four glyphs, not two: "build" covers three different errands. A hammer
  // sends the player to an industry slot, a planet to a colony, a flask to a
  // refinery, and none of the three are interchangeable — nothing about the
  // manufacturing icon told a player which one a "build" row meant. The
  // tooltip already said so; the marker now says it at a glance. Planetary
  // keeps its own tone (`text-accent`, the app's blue) rather than sharing
  // manufacturing's green, so that one split reads without hovering; reaction
  // shares manufacturing's green — both are "run an industry job", and the
  // flask glyph alone (not a third colour) is what tells them apart, which is
  // the shape-carries-meaning half of docs/DESIGN.md §7, not the colour half.
  const planetary = building && advice.method === 'planetary';
  const Glyph = building ? BUILD_GLYPH[advice.method] : Icon.Buy;
  const tone = planetary ? 'text-accent' : building ? 'text-isk-pos' : 'text-text-dim';
  return (
    <Tooltip content={<MakeOrBuyTooltip advice={advice} remaining={remaining} />} openOnTap>
      <span
        role="img"
        aria-label={label}
        className={cx(
          'shrink-0',
          tone,
          badge &&
            'rounded-xs border border-current px-1 text-[0.5625rem] leading-4 font-bold tracking-widest uppercase'
        )}
      >
        {badge ? (
          t(
            `industry.errands.badge.${building ? (advice.method === 'manufacturing' ? 'build' : advice.method) : 'buy'}`
          )
        ) : (
          <Glyph size={Icon.ICON_SIZE.sm} />
        )}
      </span>
    </Tooltip>
  );
}
