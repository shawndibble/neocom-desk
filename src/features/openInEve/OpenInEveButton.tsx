/**
 * "Open in EVE" as a button, for a detail modal's header or a dialog's row:
 * opens the target's window in the active Character's EVE client. The
 * blocked reason or the outcome shows beside it, as `SetDestinationButton`
 * does, so a refusal is never silent. The menu twin is `OpenInEveMenuItem`.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { OpenInEveTarget } from './sendOpenInEve';
import { useOpenInEve, type OpenInEveLookup } from './useOpenInEve';

export function OpenInEveButton({
  kind,
  id,
  name,
  lookup,
}: OpenInEveTarget & {
  /** What is being opened, for the button's accessible name. */
  name?: string;
  /** The id isn't known yet: find it when pressed (`id` is then ignored). */
  lookup?: OpenInEveLookup;
}) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useOpenInEve({ kind, id }, lookup);
  const label = t(`openInEve.${kind}`);
  const reasonId = useId();

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        // Stays focusable with its reason linked, rather than the native attribute (DESIGN §6c Disabled).
        aria-disabled={blockedReason !== null || undefined}
        aria-describedby={blockedReason !== null ? reasonId : undefined}
        loading={sending}
        aria-label={name ? `${label}: ${name}` : undefined}
        onClick={send}
      >
        {label}
      </Button>
      {blockedReason !== null && (
        <span id={reasonId} className="text-[0.6875rem] text-text-dim">
          {blockedReason}
        </span>
      )}
      {outcome && (
        <span
          role={outcome.tone}
          className={outcome.tone === 'alert' ? 'text-xs text-danger' : 'text-xs text-success'}
        >
          {outcome.text}
        </span>
      )}
    </span>
  );
}
