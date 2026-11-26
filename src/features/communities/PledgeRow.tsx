import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FieldError, TextInput, NeedsConnection, Button, Tooltip } from '@/components/ui';
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

function parseDelivered(text: string, max: number): number | null {
  const value = parseLocalizedNumber(text) === 0 ? 0 : parseQuantity(text);
  return value !== null && value <= max ? value : null;
}

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
  spec: string;
  progress: LineProgress;
  own: { quantity: number; delivered: number; manual?: number } | undefined;
  stale: boolean;
  canPledge: boolean;
  busy: boolean;
  onPledge: (quantity: number) => void;
  onWithdraw: () => void;
  flags?: readonly DeliveryFlag[];
  manualEntry?: boolean;
  onSaveDelivered?: (amount: number) => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(defaultPledgeQuantity(progress, own?.quantity)));
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
            <Tooltip content={parsed === null ? t('common.needsInput') : null}>
              <Button
                size="sm"
                aria-disabled={parsed === null || undefined}
                loading={busy}
                onClick={() => parsed !== null && onPledge(parsed)}
              >
                {own ? t('communities.board.updatePledge') : t('communities.board.pledge')}
              </Button>
            </Tooltip>
          </NeedsConnection>
          {own && own.delivered === 0 && (
            <NeedsConnection>
              <Button
                size="sm"
                variant="ghost"
                aria-disabled={busy || undefined}
                onClick={onWithdraw}
              >
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
            <Tooltip
              content={
                deliveredAmount === null || deliveredText.trim() === ''
                  ? t('common.needsInput')
                  : null
              }
            >
              <Button
                size="sm"
                variant="ghost"
                aria-disabled={deliveredAmount === null || deliveredText.trim() === '' || undefined}
                loading={busy}
                onClick={() => deliveredAmount !== null && onSaveDelivered(deliveredAmount)}
              >
                {t('communities.board.saveDelivered')}
              </Button>
            </Tooltip>
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
