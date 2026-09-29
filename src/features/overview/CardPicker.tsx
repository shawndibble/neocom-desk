import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  isCardShown,
  OVERVIEW_CARD_KEYS,
  OVERVIEW_CARD_LABEL,
  type OverviewCardKey,
} from './hiddenCards';

/**
 * The board's edit menu: one checkbox per card. A menu rather than an edit
 * mode, the same call `ColumnPickerMenu` makes — every toggle is already
 * reversible in one tap, so there is nothing to confirm or cancel.
 */
export function CardPicker({
  cards,
  hidden,
  onToggle,
  onShowAll,
}: {
  /** The cards this Character can have — a corp card without roles is not offered. */
  cards: readonly OverviewCardKey[];
  hidden: readonly string[];
  onToggle: (key: OverviewCardKey) => void;
  onShowAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton size="sm" icon={<Icon.EditBoard />} label={t('overview.board.editCards')} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <p className="px-2 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('overview.board.editCardsTitle')}
        </p>
        {OVERVIEW_CARD_KEYS.filter((key) => cards.includes(key)).map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={isCardShown(hidden, key)}
            // Stays open: hiding three cards should not take three trips.
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(key)}
          >
            {t(OVERVIEW_CARD_LABEL[key])}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onShowAll}>{t('overview.board.showAllCards')}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
