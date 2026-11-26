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
