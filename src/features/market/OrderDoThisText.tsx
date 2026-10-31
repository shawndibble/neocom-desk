/**
 * The fix list's "Do this": the row's call in words, the exact price as a
 * `CopyablePrice`. `interactive={false}` keeps the price plain text, for the
 * phone card's own `<button>`.
 */
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { CopyablePrice } from './CopyablePrice';
import type { OpenOrderRow } from './openOrdersModel';
import { doThisPrice, orderDoThisText, rowFixCall } from './orderDoThis';

export function OrderDoThisText({
  row,
  interactive = true,
}: {
  row: OpenOrderRow;
  interactive?: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const text = orderDoThisText(t, row);
  if (text === null) return null;
  const price = doThisPrice(rowFixCall(row).call);
  return interactive && price !== null ? (
    <CopyablePrice price={price}>{text}</CopyablePrice>
  ) : (
    <span>{text}</span>
  );
}
