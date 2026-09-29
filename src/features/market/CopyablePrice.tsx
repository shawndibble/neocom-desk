/**
 * A suggested order price you click to copy (issue #1421): every legal price
 * Open Orders suggests — undercut, floor, raise-to, outbid — is one, since
 * typing the exact ISK-and-cents figure into EVE's own price field by hand is
 * the error-prone step this exists to remove.
 *
 * The price text itself is the control — no separate copy icon beside it. A
 * caller whose sentence already states the figure (e.g.
 * `market.orders.outbidAt`, the "→ price" relist hint) passes that sentence
 * as `children` so the whole bold phrase is the tap target; otherwise the
 * formatted price is. The visible text stays the accessible name (WCAG 2.5.3
 * Label in Name); "Copy <price>" rides along as a `Tooltip`, which reaches
 * hover, focus and touch-and-hold, and is the accessible description. A successful copy raises a "Copied to clipboard"
 * `Toast` for a couple of seconds — the toast is `role="status"`, so it
 * serves the screen reader and the pointer user alike.
 *
 * Puts PLAIN DIGITS on the clipboard — `1233000`, or `12.34` when the price
 * carries cents — never `formatIsk`'s comma-grouped text, which is for
 * on-screen reading only and is not a legal paste target for EVE's price
 * field.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/components/ui';
import { Toast } from '@/components/ui/Toast';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk } from '@/lib/isk';
import { priceClipboardText } from './priceClipboardText';

/** How long the "copied" toast stays up — matches `CopyableTotal`'s own feedback window. */
const COPIED_FEEDBACK_MS = 2000;

export function CopyablePrice({
  price,
  children,
}: {
  price: number;
  /** The visible, clickable text — defaults to the formatted price. */
  children?: ReactNode;
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

  return (
    <>
      {/* `openOnTap` stays off: the tap copies, so touch reads the bubble by
          touch-and-hold, same as `CopyableTotal`. */}
      <Tooltip content={t('market.orders.copyPrice', { price: formatted })}>
        <button
          type="button"
          onClick={() => void copy()}
          // The 44px touch tier (DESIGN.md §3) on a phone, where the modal's
          // next-step and exit lines are this button alone; no extra height
          // on a pointer, where it sits inside a dense table row.
          className="inline-flex min-h-11 cursor-copy items-center rounded-xs text-left font-semibold hover:text-accent focus-visible:outline-2 focus-visible:outline-accent md:min-h-0"
        >
          {children ?? formatted}
        </button>
      </Tooltip>
      {copied && <Toast message={t('market.orders.priceCopied')} />}
    </>
  );
}
