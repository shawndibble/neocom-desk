/**
 * The Items board's price flag (#4773), before the figure in the Price cell:
 * `BaitFlag`'s look (a warning glyph in `text-warning`) with contract wording.
 * The sentence is the tooltip and the glyph's description, and the short label
 * its accessible name, so it is never a colour alone.
 */
import type { TFunction } from 'i18next';
import type { TradeHub } from '@/market/hubs';
import { Tooltip } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { ContractFlag } from '@/engine/contracts/contractFlags';
import { flagHint } from '@/features/contractSearch/contractFlagText';

export function ContractFlagMark({
  flag,
  hub,
  t,
}: {
  flag: ContractFlag;
  hub: TradeHub;
  t: TFunction;
}) {
  return (
    <Tooltip content={flagHint(flag, hub, t)}>
      <span
        tabIndex={0}
        role="img"
        aria-label={t(
          flag.kind === 'overpriced'
            ? 'contractSearch.flag.overpricedLabel'
            : 'contractSearch.flag.copyLabel'
        )}
        className="mr-1 inline-flex align-text-bottom text-warning"
      >
        <Icon.Warn aria-hidden size={Icon.ICON_SIZE.sm} />
      </span>
    </Tooltip>
  );
}
