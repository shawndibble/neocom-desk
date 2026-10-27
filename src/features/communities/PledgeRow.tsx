import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError, TextInput, NeedsConnection, Button } from '@/components/ui';
import type { DeliveryFlag } from '@/engine/communities/delivery';
import {
  STALE_PLEDGE_DAYS,
  defaultPledgeQuantity,
  parseQuantity,
  parsePledgeQuantity,
  pledgeOverage,
  type LineProgress,
  type RequestLine,
} from '@/engine/communities/requests';
import { parseLocalizedNumber } from '@/engine/numbers/parseLocalizedNumber';
import { cx } from '@/lib/cx';
import { PledgeBar } from './PledgeBar';
import { formatQuantity } from './requestFormat';

/** A delivered amount typed in: a whole number from 0 (clears it) up to the Pledge. */
function parseDelivered(text: string, max: number): number | null {
  // 0 clears it, and so do "00" and "000": parseQuantity wants a positive number.
  const value = parseLocalizedNumber(text) === 0 ? 0 : parseQuantity(text);
  return value !== null && value <= max ? value : null;
}

/**
 * One line of a Request in its side panel: the line, its stacked bar, the
 * over-pledge note, and (for a Member who can Pledge) an inline quantity field
 * with Pledge, or Update pledge and Withdraw once pledged. Pledges reserve
 * nothing, so an over-pledge only prints the note. The requester gets
 * `canPledge={false}` and sees the line and bar alone.
 */
export function PledgeRow({
  line,
  spec,
  progress,
  own,
  stale,
  canPledge,
  busy,
  onPledge,
  onWithdraw,
  flags,
  manualEntry,
  onSaveDelivered,
}: {
  line: RequestLine;
  /** "BPC, runs 10, ME 10" for a blueprint line, else empty. */
  spec: string;
  progress: LineProgress;
  /** This Member's own Pledge on the line, if any. */
  own: { quantity: number; delivered: number; manual?: number } | undefined;
  stale: boolean;
  canPledge: boolean;
  busy: boolean;
  onPledge: (quantity: number) => void;
  onWithdraw: () => void;
  /** BPC attributes that differ from the ask on contracts counted toward this Pledge. */
  flags?: readonly DeliveryFlag[];
  /** Offer a typed delivered amount: the Member cannot have it marked from contracts. */
  manualEntry?: boolean;
  /** Save what the Member typed; 0 clears it. */
  onSaveDelivered?: (amount: number) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(defaultPledgeQuantity(progress, own?.quantity)));
  // A saved Pledge changes the field's starting point: follow it (adjusting state while rendering).
  const [seenOwn, setSeenOwn] = useState(own?.quantity);
  if (seenOwn !== own?.quantity) {
    setSeenOwn(own?.quantity);
    setText(String(defaultPledgeQuantity(progress, own?.quantity)));
  }
  const [deliveredText, setDeliveredText] = useState(String(own?.manual ?? ''));
  const [seenManual, setSeenManual] = useState(own?.manual);
  if (seenManual !== own?.manual) {
    setSeenManual(own?.manual);
    setDeliveredText(String(own?.manual ?? ''));
  }
  const deliveredAmount = parseDelivered(deliveredText, own?.quantity ?? 0);
  const deliveredInvalid = deliveredText.trim() !== '' && deliveredAmount === null;
  const flagDetails = [
    ...new Set(
      (flags ?? []).map((f) =>
        t(`communities.board.deliveryFlagDetail.${f.attribute}`, { got: f.got, asked: f.asked })
      )
    ),
  ];
  const parsed = parsePledgeQuantity(text);
  const invalid = text.trim() !== '' && parsed === null;
  const over = pledgeOverage(progress);
  const fieldId = `pledge-${line.typeId}-${line.kind}`;
  return (
    <li className={cx('space-y-1.5 px-1 py-2.5', stale && 'opacity-60')}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{line.name}</span>
        {spec && <span className="text-xs text-text-dim">{spec}</span>}
      </div>
      <PledgeBar {...progress} />
      {over > 0 && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('communities.board.overPledged', { amount: formatQuantity(over) })}
        </p>
      )}
      {own && (own.delivered > 0 || own.manual !== undefined) && (
        <p className="text-[0.6875rem] text-text-dim tabular-nums">
          {t('communities.board.yourDelivered', {
            delivered: formatQuantity(own.delivered),
            quantity: formatQuantity(own.quantity),
          })}
          {own.manual !== undefined && own.delivered <= own.manual && (
            <> ({t('communities.board.manualMarker')})</>
          )}
        </p>
      )}
      {flagDetails.length > 0 && (
        <p className="text-[0.6875rem] text-warning">
          {t('communities.board.deliveryFlag', { details: flagDetails.join('; ') })}
        </p>
      )}
      {stale && (
        <p className="text-[0.6875rem] text-text-dim">
          {t('communities.board.pledgeStale', { days: STALE_PLEDGE_DAYS })}
        </p>
      )}
      {canPledge && (
        <div className="flex items-center gap-2">
          <TextInput
            id={fieldId}
            size="sm"
            inputMode="numeric"
            className="w-28 tabular-nums"
            aria-label={t('communities.board.pledgeQuantity', { name: line.name })}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${fieldId}-error` : undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && parsed !== null && !busy) onPledge(parsed);
            }}
          />
          <NeedsConnection>
            <Button
              size="sm"
              disabled={parsed === null}
              loading={busy}
              onClick={() => parsed !== null && onPledge(parsed)}
            >
              {own ? t('communities.board.updatePledge') : t('communities.board.pledge')}
            </Button>
          </NeedsConnection>
          {own && own.delivered === 0 && (
            <NeedsConnection>
              <Button size="sm" variant="ghost" disabled={busy} onClick={onWithdraw}>
                {t('communities.board.withdraw')}
              </Button>
            </NeedsConnection>
          )}
        </div>
      )}
      {manualEntry && own && onSaveDelivered && (
        <div className="flex items-center gap-2">
          <label htmlFor={`${fieldId}-delivered`} className="sr-only">
            {t('communities.board.deliveredQuantity', { name: line.name })}
          </label>
          <TextInput
            id={`${fieldId}-delivered`}
            size="sm"
            inputMode="numeric"
            className="w-28 tabular-nums"
            placeholder={t('communities.board.deliveredPlaceholder')}
            aria-invalid={deliveredInvalid || undefined}
            aria-describedby={deliveredInvalid ? `${fieldId}-delivered-error` : undefined}
            value={deliveredText}
            onChange={(e) => setDeliveredText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && deliveredAmount !== null && !busy)
                onSaveDelivered(deliveredAmount);
            }}
          />
          <NeedsConnection>
            <Button
              size="sm"
              variant="ghost"
              disabled={deliveredAmount === null || deliveredText.trim() === ''}
              loading={busy}
              onClick={() => deliveredAmount !== null && onSaveDelivered(deliveredAmount)}
            >
              {t('communities.board.saveDelivered')}
            </Button>
          </NeedsConnection>
        </div>
      )}
      {deliveredInvalid && (
        <FieldError id={`${fieldId}-delivered-error`}>
          {t('communities.board.deliveredInvalid', { max: formatQuantity(own?.quantity ?? 0) })}
        </FieldError>
      )}
      {invalid && (
        <FieldError id={`${fieldId}-error`}>{t('communities.board.pledgeInvalid')}</FieldError>
      )}
    </li>
  );
}
