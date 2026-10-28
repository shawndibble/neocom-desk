/**
 * "Open in EVE" as a button, for a detail modal's header or a dialog's row:
 * opens the target's window in the active Character's EVE client. Without
 * a Character or the Open in EVE Permission it isn't rendered at all. Offline,
 * the reason or the outcome shows beside it, as `SetDestinationButton` does,
 * so a refusal is never silent. The menu twin is `OpenInEveMenuItem`.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, type ButtonSize } from '@/components/ui';
import type { OpenInEveTarget } from './sendOpenInEve';
import { useOpenInEve, type OpenInEveLookup } from './useOpenInEve';

export function OpenInEveButton({
  kind,
  id,
  name,
  lookup,
  size = 'sm',
  inRow = false,
  characterId,
  label: labelOverride,
  specific = false,
  className,
}: OpenInEveTarget & {
  /** What is being opened, for the button's accessible name. */
  name?: string;
  /** The id isn't known yet: find it when pressed (`id` is then ignored). */
  lookup?: OpenInEveLookup;
  /** Match the buttons beside it; `sm` for a header. */
  size?: ButtonSize;
  /**
   * The button and its reason or outcome join the parent's flex row as
   * separate items, so a message that appears wraps alone instead of taking
   * the button to a new line under the pointer.
   */
  inRow?: boolean;
  /** Send from this Character, not the active one (see `OpenInEveOptions`). */
  characterId?: number;
  /** Replaces the kind's label, e.g. to name the Character it sends from. */
  label?: string;
  /** The surface shows more than one Open in EVE control: say what this one opens. */
  specific?: boolean;
  /** Extra classes on the wrapper, e.g. to place it in a grid cell. */
  className?: string;
}) {
  const { t } = useTranslation();
  const { unavailable, blockedReason, sending, outcome, send } = useOpenInEve(
    { kind, id },
    lookup,
    characterId === undefined ? undefined : { characterId }
  );
  const label =
    labelOverride ??
    (specific && kind !== 'information' ? t(`openInEve.${kind}`) : t('openInEve.label'));
  const reasonId = useId();

  if (unavailable) return null;

  return (
    <span
      className={
        inRow ? 'contents' : `inline-flex flex-wrap items-center gap-2 ${className ?? ''}`.trimEnd()
      }
    >
      <Button
        size={size}
        // Stays focusable with its reason linked, rather than the native attribute (DESIGN §6c Disabled).
        aria-disabled={blockedReason !== null || undefined}
        aria-describedby={blockedReason !== null ? reasonId : undefined}
        loading={sending}
        aria-label={name ? `${label}: ${name}` : undefined}
        onClick={send}
      >
        <span className="whitespace-nowrap">{label}</span>
      </Button>
      {blockedReason !== null && (
        <span id={reasonId} className="self-center text-[0.6875rem] text-text-dim">
          {blockedReason}
        </span>
      )}
      {outcome && (
        <span
          role={outcome.tone}
          className={`self-center text-xs ${outcome.tone === 'alert' ? 'text-danger' : 'text-success'}`}
        >
          {outcome.text}
        </span>
      )}
    </span>
  );
}
