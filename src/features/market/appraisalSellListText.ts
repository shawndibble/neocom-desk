import { appraisalUndercut, type AppraisalItem } from '@/engine/market/appraisal';
import { priceClipboardText } from './priceClipboardText';

export function appraisalSellListText(items: readonly AppraisalItem[]): string {
  return items
    .map((item) => {
      const undercut = appraisalUndercut(item);
      return undercut === null ? null : `${item.name}\t${priceClipboardText(undercut.price)}`;
    })
    .filter((line): line is string => line !== null)
    .join('\n');
}
