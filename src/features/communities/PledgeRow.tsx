import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FieldError, TextInput } from '@/components/ui';
import {
  STALE_PLEDGE_DAYS,
  defaultPledgeQuantity,
  parsePledgeQuantity,
  pledgeOverage,
  type LineProgress,
  type RequestLine,
} from '@/engine/communities/requests';
import { cx } from '@/lib/cx';
import { PledgeBar } from './PledgeBar';
import { formatQuantity } from './requestFormat';

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
}: {
  line: RequestLine;
  /** "BPC, runs 10, ME 10" for a blueprint line, else empty. */
  spec: string;
  progress: LineProgress;
  /** This Member's own Pledge on the line, if any. */
  own: { quantity: number; delivered: number } | undefined;
  stale: boolean;
  canPledge: boolean;
  busy: boolean;
  onPledge: (quantity: number) => void;
  onWithdraw: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(String(defaultPledgeQuantity(progress, own?.quantity)));
  // A saved Pledge changes the field's starting point: follow it (adjusting state while rendering).
  const [seenOwn, setSeenOwn] = useState(own?.quantity);
  if (seenOwn !== own?.quantity) {
    setSeenOwn(own?.quantity);
    setText(String(defaultPledgeQuantity(progress, own?.quantity)));
  }
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
          <Button
            size="sm"
            disabled={parsed === null}
            loading={busy}
            onClick={() => parsed !== null && onPledge(parsed)}
          >
            {own ? t('communities.board.updatePledge') : t('communities.board.pledge')}
          </Button>
          {own && own.delivered === 0 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onWithdraw}>
              {t('communities.board.withdraw')}
            </Button>
          )}
        </div>
      )}
      {invalid && (
        <FieldError id={`${fieldId}-error`}>{t('communities.board.pledgeInvalid')}</FieldError>
      )}
    </li>
  );
}
