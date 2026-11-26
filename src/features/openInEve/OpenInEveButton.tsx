import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { OutcomeNote } from '@/components/OutcomeNote';
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
  name?: string;
  lookup?: OpenInEveLookup;
  size?: ButtonSize;
  inRow?: boolean;
  characterId?: number;
  label?: string;
  specific?: boolean;
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
      <OutcomeNote outcome={outcome} className="self-center" />
    </span>
  );
}
