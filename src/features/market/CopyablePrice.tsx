/**
 * A suggested order price with a one-tap copy button (issue #1421): every
 * legal price Open Orders suggests — undercut, floor, raise-to, outbid —
 * needs one, since typing the exact ISK-and-cents figure into EVE's own
 * price field by hand is the error-prone step this exists to remove.
 *
 * Puts PLAIN DIGITS on the clipboard — `1233000`, or `12.34` when the price
 * carries cents — never `formatIsk`'s comma-grouped text, which is for
 * on-screen reading only and is not a legal paste target for EVE's price
 * field.
 *
 * Deliberately a Fragment, not a wrapping element: the price text sits as a
 * plain sibling of the copy `IconButton` rather than inside a `<span>` of its
 * own, so a caller's own container is the only element whose text content is
 * the price — nesting an extra element here would make `getByText` match
 * both it and its parent, an ambiguity `HubCompareCards.tsx`'s
 * `CopyableTotal` sidesteps by never rendering the value as plain text at
 * all (its whole figure IS the button).
 *
 * Mirrors `CopyableTotal`'s `writeToClipboard` call, but with a real
 * `IconButton` (44px touch target, DESIGN.md §3) rather than a bare button —
 * this control sits beside sentence text it must not swallow into its own
 * tap target, where `CopyableTotal`'s whole figure is the tap target.
 *
 * Unlike `CopyableTotal`, the "copied" confirmation never swaps into
 * `IconButton`'s `tooltip` prop: that prop's own contract (WCAG 2.5.3 Label
 * in Name) requires its text stay a substring of `label`, which "Copied to
 * clipboard" is not. The confirmation instead only ever reaches the `status`
 * live region below — the tooltip and the button's accessible name stay the
 * copy prompt at all times.
 *
 * `showValue` (default `true`) drops the leading price text — icon-only —
 * for a call site whose surrounding sentence already states the same figure
 * (e.g. `market.orders.outbidAt`, an exit row's own label): showing it a
 * second time next to the button read as "520.10 520.10 [copy]". The
 * button's accessible name still carries the price either way, so a screen
 * reader hears it exactly once regardless.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui/IconButton';
import * as Icon from '@/components/ui/icons';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk } from '@/lib/isk';
import { priceClipboardText } from './priceClipboardText';

/** How long the "copied" confirmation stays up in the live region before it clears — matches `CopyableTotal`'s own. */
const COPIED_FEEDBACK_MS = 2000;

export function CopyablePrice({
  price,
  showValue = true,
}: {
  price: number;
  /** `false` for a call site whose sentence already states this price — see the docstring above. */
  showValue?: boolean;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  async function copy() {
    await writeToClipboard(priceClipboardText(price));
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }

  const formatted = formatIsk(price, 2);
  const copyLabel = t('market.orders.copyPrice', { price: formatted });

  return (
    <>
      {showValue && formatted}
      <IconButton
        icon={<Icon.CopyToClipboard />}
        label={copyLabel}
        onClick={() => void copy()}
        className="ml-1 align-middle"
      />
      {/* One `status` region per price, same pattern `HubCompareCards.tsx`'s
          `CopyableTotal` uses for its shared one — this control has no
          shared list to hang a single region off, so each gets its own. */}
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('market.orders.priceCopied') : ''}
      </span>
    </>
  );
}
