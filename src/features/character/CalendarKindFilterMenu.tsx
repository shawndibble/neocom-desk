import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { cx } from '@/lib/cx';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui';
import { DropdownMenuTrigger } from '@/components/ui';
import { IconButton } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import {
  CHARACTER_BOARD_ITEM_KINDS,
  type BoardCorporation,
  type CharacterBoardItemKind,
} from '@/engine/character/board';
import type { CorpEventFilter } from '@/engine/character/deadlines';
import { corpLabelText } from '@/features/corp/corpTicker';
import { KIND_LABEL } from './calendarKindLabels';
import { KIND_TEXT } from '@/components/ui/kindTone';
import { KIND_ICON } from './calendarKindIcons';
import { kindHasFilterRow } from './calendarKindFilter';

export interface CalendarKindFilterMenuProps {
  hidden: readonly CharacterBoardItemKind[];
  onToggle: (kind: CharacterBoardItemKind) => void;
  onShowAll: () => void;
  onHideAll: (kinds: readonly CharacterBoardItemKind[]) => void;
  counts: Map<CharacterBoardItemKind, number>;
  readableKinds: readonly CharacterBoardItemKind[];
  reauthKinds: readonly CharacterBoardItemKind[];
  corporations?: readonly BoardCorporation[];
  corpFilter?: CorpEventFilter;
  onCorpFilter?: (filter: CorpEventFilter) => void;
  sharingCorporations?: readonly BoardCorporation[];
  sharingCorpFilter?: CorpEventFilter;
  onSharingCorpFilter?: (filter: CorpEventFilter) => void;
}

const NO_CORPORATIONS: readonly BoardCorporation[] = [];

function CorporationFilterSub({
  trigger,
  value,
  corporations,
  allLabel,
  noneLabel,
  onChange,
}: {
  trigger: ReactNode;
  value: CorpEventFilter;
  corporations: readonly BoardCorporation[];
  allLabel: string;
  noneLabel?: string;
  onChange: (filter: CorpEventFilter) => void;
}) {
  const keepOpen = (event: Event) => event.preventDefault();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{trigger}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuRadioGroup
          value={String(value)}
          onValueChange={(next) =>
            onChange(next === 'all' || next === 'none' ? next : Number(next))
          }
        >
          <DropdownMenuRadioItem value="all" onSelect={keepOpen}>
            {allLabel}
          </DropdownMenuRadioItem>
          {corporations.map((corporation) => (
            <DropdownMenuRadioItem
              key={corporation.id}
              value={String(corporation.id)}
              onSelect={keepOpen}
            >
              <span className="flex-1 truncate">{corpLabelText(corporation)}</span>
            </DropdownMenuRadioItem>
          ))}
          {noneLabel !== undefined && (
            <DropdownMenuRadioItem value="none" onSelect={keepOpen}>
              {noneLabel}
            </DropdownMenuRadioItem>
          )}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export function KindGlyph({ kind }: { kind: CharacterBoardItemKind }) {
  const Glyph = KIND_ICON[kind];
  return <Glyph aria-hidden="true" className={`size-4 shrink-0 ${KIND_TEXT[kind]}`} />;
}

export function CalendarKindFilterMenu({
  hidden,
  onToggle,
  onShowAll,
  onHideAll,
  counts,
  readableKinds,
  reauthKinds,
  corporations = NO_CORPORATIONS,
  corpFilter = 'all',
  onCorpFilter,
  sharingCorporations = NO_CORPORATIONS,
  sharingCorpFilter = 'all',
  onSharingCorpFilter,
}: CalendarKindFilterMenuProps) {
  const { t } = useTranslation();
  const hiddenSet = new Set(hidden);
  const readable = new Set(readableKinds);
  const needsReauth = new Set(reauthKinds);

  function countLabel(kind: CharacterBoardItemKind) {
    if (needsReauth.has(kind)) return t('calendar.filter.notGranted');
    if (!readable.has(kind)) return t('calendar.filter.unavailable');
    return counts.get(kind) ?? 0;
  }

  function hasRow(kind: CharacterBoardItemKind) {
    if (!kindHasFilterRow(kind, { hidden: hiddenSet, readable, reauth: needsReauth })) return false;
    if (!readable.has(kind) || hiddenSet.has(kind) || needsReauth.has(kind)) return true;
    return (counts.get(kind) ?? 0) > 0;
  }

  const listedKinds = CHARACTER_BOARD_ITEM_KINDS.filter(hasRow);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={<Icon.Filter />}
          label={
            hidden.length === 0
              ? t('calendar.filter.open')
              : t('calendar.filter.openWithCount', { count: hidden.length })
          }
          pressed={
            hidden.length > 0 ||
            (corporations.length > 0 && corpFilter !== 'all') ||
            (sharingCorporations.length > 1 && sharingCorpFilter !== 'all')
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <p className={cx(eyebrowClassName, 'px-2 py-1.5')}>{t('calendar.filter.title')}</p>
        {CHARACTER_BOARD_ITEM_KINDS.filter(hasRow).map((kind) => (
          <DropdownMenuCheckboxItem
            key={kind}
            checked={!hiddenSet.has(kind)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(kind)}
          >
            <KindGlyph kind={kind} />
            <span className="flex-1">{t(KIND_LABEL[kind])}</span>
            <span className="ml-2 text-[0.6875rem] text-text-dim tabular-nums">
              {countLabel(kind)}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        {corporations.length > 0 && (
          <CorporationFilterSub
            trigger={t('calendar.corpFilter.title')}
            value={corpFilter}
            corporations={corporations.length > 1 ? corporations : NO_CORPORATIONS}
            allLabel={t('calendar.corpFilter.all')}
            noneLabel={t('calendar.corpFilter.none')}
            onChange={(filter) => onCorpFilter?.(filter)}
          />
        )}
        {sharingCorporations.length > 1 && (
          <CorporationFilterSub
            trigger={
              <>
                <KindGlyph kind="sharedMoonPop" />
                <span className="flex-1">{t('calendar.sharingCorpFilter.title')}</span>
              </>
            }
            value={sharingCorpFilter}
            corporations={sharingCorporations}
            allLabel={t('calendar.sharingCorpFilter.all')}
            onChange={(filter) => onSharingCorpFilter?.(filter)}
          />
        )}
        <div className="mt-1 flex border-t border-line">
          <DropdownMenuItem
            aria-disabled={hidden.length === 0 || undefined}
            onSelect={(event) => {
              event.preventDefault();
              if (hidden.length > 0) onShowAll();
            }}
            className="flex-1 justify-center rounded-none touch:min-h-9"
          >
            {t('calendar.filter.showAll')}
          </DropdownMenuItem>
          <DropdownMenuItem
            aria-disabled={listedKinds.every((k) => hiddenSet.has(k)) || undefined}
            onSelect={(event) => {
              event.preventDefault();
              if (!listedKinds.every((k) => hiddenSet.has(k))) onHideAll(listedKinds);
            }}
            className="flex-1 justify-center rounded-none border-l border-line touch:min-h-9"
          >
            {t('calendar.filter.hideAll')}
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
