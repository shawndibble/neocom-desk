/**
 * The fix list's "Do this": the row's call in words, the exact price as a
 * `CopyablePrice`. `interactive={false}` keeps the price plain text, for the
 * phone card's own `<button>`. "Turn in instead" is a dashed figure opening
 * the order's turn-in (`onOpenTurnIn`) when the caller gives one.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { TurnInFigureButton } from '@/features/campaigns/TurnInDetail';
import { CopyablePrice } from './CopyablePrice';
import type { OpenOrderRow } from './openOrdersModel';
import { doThisPrice, orderDoThisText, rowFixCall } from './orderDoThis';

export function OrderDoThisText({
  row,
  interactive = true,
  onOpenTurnIn,
}: {
  row: OpenOrderRow;
  interactive?: boolean;
  /** Opens the order's turn-in; "Turn in instead" stays plain text without it. */
  onOpenTurnIn?: (row: OpenOrderRow) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const text = orderDoThisText(t, row);
  if (text === null) return null;
  const { call } = rowFixCall(row);
  if (call.kind === 'turnIn' && interactive && onOpenTurnIn) {
    return (
      <TurnInFigureButton name={row.typeName} onClick={() => onOpenTurnIn(row)}>
        {text}
      </TurnInFigureButton>
    );
  }
  const price = doThisPrice(call);
  return interactive && price !== null ? (
    <CopyablePrice price={price}>{text}</CopyablePrice>
  ) : (
    <span>{text}</span>
  );
}
