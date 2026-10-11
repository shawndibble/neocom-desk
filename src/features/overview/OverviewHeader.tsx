/**
 * The Overview's header controls, handed to `CharacterHeader`'s `actions` slot:
 * the Character switcher, the Next deadline chip, "Updated N ago" with Refresh,
 * and Customize.
 *
 * It reads what is on screen, not what is stored: the chip and the age count
 * only the widgets the page draws (a widget hidden on a phone offers neither a
 * clock nor a read). Refresh bumps the page's refresh epoch, which every
 * mounted data source watches.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Button,
  DataAgeBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  SEVERITY_TEXT,
  SeverityIcon,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { focusRingClassName, interactiveClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { formatCountdown } from '@/lib/duration';
import { useTicker } from '@/lib/ticker';
import { useIsPhone } from '@/lib/useIsPhone';
import { setActiveCharacterAndScope } from './switchCharacter';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOverviewRefresh } from './widgets/data/refreshContext';
import { useKindViews } from './widgets/data/useWidgetView';
import { useOverviewEdit } from './widgets/editContext';
import { collectDeadlines, stalestFetch } from './widgets/headerSummary';
import type { Widget } from './widgets/layout';
import { chipTone, nextDeadline, type ChipTone } from './widgets/nextDeadline';
import { useOverviewScopeAll } from './widgets/scope';
import { distinctKinds, visibleWidgets } from './widgets/visibility';

const CLOCK_TICK_MS = 30_000;

/** The chip's own ladder: amber under 3 h, red under 30 min (not the per-card severities). */
const CHIP_TEXT: Record<ChipTone, string> = {
  neutral: 'text-text',
  warning: SEVERITY_TEXT.warning,
  danger: SEVERITY_TEXT.critical,
};

function CharacterSwitcher() {
  const { t } = useTranslation();
  const characters = useLiveQuery(() => db.characters.toArray(), []);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const scopeAll = useOverviewScopeAll((state) => state.value);
  const sorted = useMemo(
    () => [...(characters ?? [])].sort((a, b) => a.addedAt - b.addedAt),
    [characters]
  );
  const active = sorted.find((character) => character.characterId === activeCharacterId);
  const label = scopeAll
    ? t('overview.header.allCharacters')
    : (active?.name ?? t('common.unknown'));
  const value = scopeAll ? 'all' : String(activeCharacterId ?? '');
  // A lone Character has nothing to switch to; "All characters" would be the same page.
  if (sorted.length < 2) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" aria-label={t('overview.header.switchLabel', { name: label })}>
          <Icon.AllCharacters size={Icon.ICON_SIZE.md} aria-hidden="true" />
          <span className="hidden max-w-40 truncate md:inline">{label}</span>
          <Icon.Expanded size={Icon.ICON_SIZE.sm} aria-hidden="true" className="hidden md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => void setActiveCharacterAndScope(next)}
        >
          {sorted.map((character) => (
            <DropdownMenuRadioItem
              key={character.characterId}
              value={String(character.characterId)}
            >
              {character.name}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value="all">
            {t('overview.header.allCharactersCount', { count: sorted.length })}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OverviewHeader({ widgets }: { widgets: readonly Widget[] }) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const { refresh } = useOverviewRefresh();
  const { editing, startEditing } = useOverviewEdit();
  const now = useTicker(CLOCK_TICK_MS);

  const shown = useMemo(() => visibleWidgets(widgets, isPhone), [widgets, isPhone]);
  const requests = useMemo(
    () => distinctKinds(shown).map((kind) => ({ kind, scopeAll: false })),
    [shown]
  );
  const views = useKindViews(requests);
  const all = [...views.values()];

  const next = nextDeadline(collectDeadlines(all), now);
  const remaining = next ? next.at - now : 0;
  const tone = chipTone(remaining);
  const { date: fetchedAt } = stalestFetch(all);
  const refreshing = all.some((view) => view.status.loading);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CharacterSwitcher />
      {next && (
        <Link
          to={next.to}
          className={cx(
            'inline-flex min-h-11 min-w-0 items-center gap-1.5 rounded-xs border border-line bg-panel px-2.5 py-1 text-[0.8125rem] whitespace-nowrap hover:underline md:min-h-8',
            interactiveClassName,
            focusRingClassName
          )}
        >
          <span className="text-text-dim">{t('overview.header.next')}</span>
          {tone !== 'neutral' && (
            <SeverityIcon severity={tone === 'danger' ? 'critical' : 'warning'} />
          )}
          <b className={cx('font-semibold tabular-nums', CHIP_TEXT[tone])}>
            {formatCountdown(remaining / 1000)}
          </b>
          <span className="max-w-48 truncate text-text-dim">{next.note}</span>
        </Link>
      )}
      <span className="flex items-center gap-1.5">
        {fetchedAt && (
          <span className="flex items-center gap-1 text-[0.6875rem] text-text-dim">
            {t('overview.header.updated')}
            <DataAgeBadge date={fetchedAt} alwaysVisible />
          </span>
        )}
        <IconButton
          size="sm"
          icon={<Icon.Refresh />}
          label={t('overview.board.refresh')}
          onClick={refresh}
          busy={refreshing}
        />
      </span>
      {/* While customizing, the edit bar owns Cancel and Done: two Done buttons would be one too many. */}
      {!editing && (
        <Button size="sm" onClick={startEditing}>
          <Icon.EditBoard size={Icon.ICON_SIZE.md} aria-hidden="true" />
          {t('overview.header.customize')}
        </Button>
      )}
    </div>
  );
}
