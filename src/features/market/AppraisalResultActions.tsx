/** The Appraisal result Panel's header actions: Compare Hubs, columns, Share and the copy/export menu. */
import { useTranslation } from 'react-i18next';
import { ColumnPickerMenu, IconButton, MenuItem, useOpenAfterMenu } from '@/components/ui';
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
  return (
    <>
      {/* An icon at every width, like the Columns, Share and export controls beside it. */}
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
                  : undefined
        }
        disabled={
          characterId === null ||
          !isSyncConfigured() ||
          rowCount === 0 ||
          shareItemCount > MAX_SNAPSHOT_ITEMS ||
          share.status === 'saving'
        }
        onClick={() => void handleShare()}
      />
      {pending !== null && (
        <span role="status" className="text-[0.6875rem] text-text-dim">
          {t('market.appraisal.copyWaiting', { list: t(`market.appraisal.copyList.${pending}`) })}
        </span>
      )}
      {copied !== null && (
        <span role="status" className="text-[0.6875rem] text-text-dim">
          {t('market.appraisal.copied', {
            list: t(`market.appraisal.copyList.${copied.list}`),
            count: copied.count,
          })}
        </span>
      )}
      <TableActionsMenu
        name={t('market.appraisal.resultTitle')}
        tableExport={tableExport}
        onCloseAutoFocus={openAfterMenu.onCloseAutoFocus}
      >
        {COPY_LISTS.map((list) => (
          <MenuItem
            key={list}
            disabled={copyLists[list].count === 0 || pending !== null}
            onSelect={() => void handleCopy(list)}
          >
            {t(`market.appraisal.copyList.${list}`)}
            {copyLists[list].count > 0 && (
              <span className="ml-auto pl-3 text-text-dim">{copyLists[list].count}</span>
            )}
          </MenuItem>
        ))}
        <MenuItem disabled={!canOpen} onSelect={() => void handleOpenInJanice()}>
          {t('market.appraisal.openInJanice')}
          <ExternalMark />
          <span className="ml-auto pl-4 text-text-dim">
            {altChordDisplayKey(isApplePlatform(), 'J')}
          </span>
        </MenuItem>
      </TableActionsMenu>
    </>
  );
}
