/**
 * "Open in EVE" as a button, for a detail modal's header or a dialog's row:
 * opens the target's window in the active Character's EVE client. The
 * blocked reason or the outcome shows beside it, as `SetDestinationButton`
 * does, so a refusal is never silent. The menu twin is `OpenInEveMenuItem`.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';
import type { OpenInEveTarget } from './sendOpenInEve';
import { useOpenInEve } from './useOpenInEve';

export function OpenInEveButton({
  kind,
  id,
  name,
}: OpenInEveTarget & {
  /** What is being opened, for the button's accessible name. */
  name?: string;
}) {
  const { t } = useTranslation();
  const { blockedReason, sending, outcome, send } = useOpenInEve({ kind, id });
  const label = t(`openInEve.${kind}`);

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        disabled={blockedReason !== null || sending}
        loading={sending}
        aria-label={name ? `${label}: ${name}` : undefined}
        onClick={send}
      >
        {label}
      </Button>
      {blockedReason !== null && (
        <span className="text-[0.6875rem] text-text-dim">{blockedReason}</span>
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
