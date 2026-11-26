import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  IconButton,
  LiveNote,
  DisabledMenuItem,
  MenuItem,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  useOpenAfterMenu,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { ExternalMark } from '@/components/ui/ExternalLink';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { isSyncConfigured } from '@/app/syncStatus';
import { altChordDisplayKey, isApplePlatform } from '@/lib/shortcuts';
import { MAX_SNAPSHOT_ITEMS } from '@/engine/market/appraisalSnapshot';
import type { AppraisalController } from './useAppraisal';
import { useAppraisalColumns } from './useAppraisalColumns';
import { useAppraisalCopyLists, COPY_LISTS } from './useAppraisalCopyLists';
import { useAppraisalJanice } from './useAppraisalJanice';
import { useAppraisalShare } from './useAppraisalShare';

type Columns = ReturnType<typeof useAppraisalColumns>;
type Share = ReturnType<typeof useAppraisalShare>;
type CopyLists = ReturnType<typeof useAppraisalCopyLists>;
type Janice = ReturnType<typeof useAppraisalJanice>;

interface AppraisalResultActionsProps {
  compare: AppraisalController['compare'];
  compareExpanded: boolean;
  onToggleCompare: () => void;
  columns: Pick<
    Columns,
    'availableColumns' | 'visibleColumns' | 'optionalColumnsById' | 'toggleColumn' | 'tableExport'
  >;
  share: Pick<Share, 'share' | 'handleShare' | 'shareItemCount'>;
  copy: Pick<CopyLists, 'copied' | 'pending' | 'copyLists' | 'handleCopy'>;
  janice: Pick<Janice, 'handleOpenInJanice'> & { canOpen: boolean };
  characterId: number | null;
  rowCount: number;
}

export function AppraisalResultActions({
  compare,
  compareExpanded,
  onToggleCompare,
  columns: { availableColumns, visibleColumns, optionalColumnsById, toggleColumn, tableExport },
  share: { share, handleShare, shareItemCount },
  copy: { copied, pending, copyLists, handleCopy },
  janice: { handleOpenInJanice, canOpen },
  characterId,
  rowCount,
}: AppraisalResultActionsProps) {
  const { t } = useTranslation();
  const openAfterMenu = useOpenAfterMenu();
  const shareBlocked =
    characterId === null ||
    !isSyncConfigured() ||
    rowCount === 0 ||
    shareItemCount > MAX_SNAPSHOT_ITEMS ||
    share.status === 'saving';
  return (
    <>
      {compare !== null && (
        <IconButton
          size="sm"
          icon={<Icon.Compare />}
          label={t('market.appraisal.compareHubsTitle')}
          pressed={compareExpanded}
          onClick={() => onToggleCompare()}
        />
      )}
      <ColumnPickerMenu
        available={availableColumns}
        visible={visibleColumns}
        columnsById={optionalColumnsById}
        onToggle={toggleColumn}
        buttonLabel={t('market.appraisal.columnsButton')}
        menuTitle={t('market.appraisal.columnsMenuTitle')}
        size="sm"
      />
      <IconButton
        size="sm"
        icon={share.status === 'copied' ? <Icon.Done /> : <Icon.Share />}
        label={t('market.appraisal.share')}
        tooltip={
          shareItemCount > MAX_SNAPSHOT_ITEMS
            ? t('market.appraisal.shareTooLarge')
            : share.status === 'saving'
              ? t('market.appraisal.shareSaving')
              : share.status === 'failed'
                ? t('market.appraisal.shareFailed')
                : share.status === 'copied'
                  ? t('market.appraisal.shareCopied')
                  : shareBlocked
                    ? t('market.appraisal.shareUnavailable')
                    : undefined
        }
        aria-disabled={shareBlocked || undefined}
        onClick={() => void handleShare()}
      />
      {pending !== null && (
        <LiveNote as="span" className="text-[0.6875rem] text-text-dim">
          {t('market.appraisal.copyWaiting', { list: t(`market.appraisal.copyList.${pending}`) })}
        </LiveNote>
      )}
      {copied !== null && (
        <LiveNote as="span" className="text-[0.6875rem] text-text-dim">
          {t('market.appraisal.copied', {
            list: t(`market.appraisal.copyList.${copied.list}`),
            count: copied.count,
          })}
        </LiveNote>
      )}
      <TableActionsMenu
        name={t('market.appraisal.resultTitle')}
        tableExport={tableExport}
        onCloseAutoFocus={openAfterMenu.onCloseAutoFocus}
      >
        {COPY_LISTS.map((list) =>
          list === 'turnIn' && copyLists.traders.length > 0 ? (
            <MenuSub key={list}>
              <MenuSubTrigger>
                {t('market.appraisal.copyList.turnIn')}
                <span className="ml-auto pl-3 text-text-dim">{copyLists.turnIn.count}</span>
              </MenuSubTrigger>
              <MenuSubContent>
                {copyLists.traders.map((trader) =>
                  pending !== null ? (
                    <DisabledMenuItem key={trader.key} reason={t('market.appraisal.copyBusy')}>
                      {trader.label}
                    </DisabledMenuItem>
                  ) : (
                    <MenuItem
                      key={trader.key}
                      onSelect={() => void handleCopy('turnIn', trader.key)}
                    >
                      {trader.label}
                      <span className="ml-auto pl-3 text-text-dim">{trader.count}</span>
                    </MenuItem>
                  )
                )}
              </MenuSubContent>
            </MenuSub>
          ) : copyLists[list].count === 0 || pending !== null ? (
            <DisabledMenuItem
              key={list}
              reason={
                copyLists[list].count === 0
                  ? t('market.appraisal.copyNothing')
                  : t('market.appraisal.copyBusy')
              }
            >
              {t(`market.appraisal.copyList.${list}`)}
            </DisabledMenuItem>
          ) : (
            <MenuItem key={list} onSelect={() => void handleCopy(list)}>
              {t(`market.appraisal.copyList.${list}`)}
              <span className="ml-auto pl-3 text-text-dim">{copyLists[list].count}</span>
            </MenuItem>
          )
        )}
        {canOpen ? (
          <MenuItem onSelect={() => void handleOpenInJanice()}>
            {t('market.appraisal.openInJanice')}
            <ExternalMark />
            <span className="ml-auto pl-4 text-text-dim">
              {altChordDisplayKey(isApplePlatform(), 'J')}
            </span>
          </MenuItem>
        ) : (
          <DisabledMenuItem reason={t('market.appraisal.janiceNeedsText')}>
            {t('market.appraisal.openInJanice')}
            <ExternalMark />
          </DisabledMenuItem>
        )}
      </TableActionsMenu>
    </>
  );
}
