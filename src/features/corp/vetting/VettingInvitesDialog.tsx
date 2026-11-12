/**
 * Invite links, for any reviewer: `mode="new"` is the small dialog the queue's header opens for
 * an invite-only corp (who the link is for, Create, then the link with Copy); `mode="list"` is
 * every live link with who made it, when and how often it was used, and the same form under it.
 * A row's one visible action is Copy link; Revoke, which a confirm guards, sits in the row's
 * menu (⋮, right-click, touch and hold) with Copy link again, so the menu alone does the lot.
 * One `DataTable` at every width: cards on a phone. A link is
 * `<origin>/apply/<corporationId>?invite=<code>`.
 */
import { useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  LiveStatus,
  MenuItem,
  Modal,
  RowActionsMenu,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useOpenAfterMenu } from '@/components/ui/useOpenAfterMenu';
import { InlineError } from '@/components/ui/InlineError';
import {
  VETTING_INVITE_LABEL_MAX,
  VETTING_INVITES_MAX,
  type VettingInvite,
} from '@/engine/vetting';
import { callableErrorReason } from '@/lib/callableError';
import { writeToClipboard } from '@/lib/clipboard';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';
import { useCopyFeedback } from '@/lib/useCopyFeedback';
import { firstConnected, type FocusCandidate } from '@/lib/useFocusAfterCommit';
import { useIsPhone } from '@/lib/useIsPhone';
import { applyLink } from './vettingText';
import { vettingErrorKey } from './vettingView';

interface VettingInvitesDialogProps {
  mode: 'new' | 'list';
  corporationId: number;
  invites: readonly VettingInvite[];
  /** The apply link works without an invite: the list says so. */
  inviteOnly: boolean;
  /** Makes a link and answers with the invites as they now stand; rejects with the refusal. */
  onCreate: (label: string) => Promise<readonly VettingInvite[]>;
  onRevoke: (code: string) => Promise<void>;
  onClose: () => void;
}

export function VettingInvitesDialog({
  mode,
  corporationId,
  invites,
  inviteOnly,
  onCreate,
  onRevoke,
  onClose,
}: VettingInvitesDialogProps) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const timeZone = useTimeZone();
  const labelRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<VettingInvite | null>(null);
  const [revoking, setRevoking] = useState<VettingInvite | null>(null);
  const { copied, flash } = useCopyFeedback<string>(2000);
  const { run, onCloseAutoFocus } = useOpenAfterMenu();
  // Each row's Copy link, so focus has somewhere to land once a revoked row is gone (§7).
  const copyButtons = useRef(new Map<string, HTMLButtonElement>());
  const afterRevoke = useRef<readonly FocusCandidate[]>([]);
  const askRevoke = (row: VettingInvite) => {
    const index = invites.findIndex((invite) => invite.code === row.code);
    const button = (invite: VettingInvite | undefined) => () =>
      invite === undefined ? null : copyButtons.current.get(invite.code);
    // The next link, else the one before, else the field that makes a new one.
    afterRevoke.current = [button(invites[index + 1]), button(invites[index - 1]), labelRef];
    setRevoking(row);
  };

  const full = invites.length >= VETTING_INVITES_MAX;
  const ready = label.trim() !== '' && !full;
  const create = async () => {
    if (!ready || busy) return;
    const wanted = label.trim();
    const before = new Set(invites.map((invite) => invite.code));
    setBusy(true);
    setError(null);
    try {
      const next = await onCreate(wanted);
      setMade(next.find((invite) => !before.has(invite.code)) ?? null);
      setLabel('');
    } catch (err) {
      setError(t(vettingErrorKey(callableErrorReason(err))));
    } finally {
      setBusy(false);
    }
  };
  const copy = async (invite: VettingInvite) => {
    try {
      await writeToClipboard(applyLink(corporationId, invite.code));
      flash(invite.code);
    } catch {
      // The clipboard was refused; nothing was copied and nothing claims it was.
    }
  };
  const copyButton = (invite: VettingInvite, inRow = false) => (
    <Button
      ref={
        inRow
          ? (el) => {
              if (el) copyButtons.current.set(invite.code, el);
              else copyButtons.current.delete(invite.code);
            }
          : undefined
      }
      size={inRow ? 'sm' : undefined}
      aria-label={t('vetting.invites.copyNamed', { label: invite.label })}
      onClick={() => void copy(invite)}
    >
      {t(copied === invite.code ? 'vetting.copied' : 'vetting.invites.copy')}
    </Button>
  );

  const form = (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <label className="block min-w-0 flex-1 space-y-1">
        <span className="block text-xs text-text-dim">{t('vetting.invites.label')}</span>
        <TextInput
          ref={labelRef}
          value={label}
          className="w-full"
          maxLength={VETTING_INVITE_LABEL_MAX}
          onChange={(event) => setLabel(event.target.value)}
          autoComplete="off"
        />
      </label>
      <Button
        type="submit"
        variant={mode === 'new' ? 'primary' : 'ghost'}
        className="max-sm:w-full"
        loading={busy}
        aria-disabled={!ready || undefined}
      >
        {t('vetting.invites.create')}
      </Button>
      <p className="w-full text-xs text-text-dim">
        {full
          ? t('vetting.invites.full', { count: VETTING_INVITES_MAX })
          : t('vetting.invites.labelHint')}
      </p>
      {error && <InlineError>{error}</InlineError>}
    </form>
  );

  const madeLink = made !== null && (
    <div className="space-y-1 text-sm">
      <span className="block text-xs text-text-dim">
        {t('vetting.invites.createdFor', { label: made.label })}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {phone ? (
          <p className="w-full text-sm break-all text-text-dim">
            {applyLink(corporationId, made.code)}
          </p>
        ) : (
          <TextInput
            readOnly
            aria-label={t('vetting.invites.createdFor', { label: made.label })}
            value={applyLink(corporationId, made.code)}
            className="min-w-0 flex-1"
            onFocus={(event) => event.target.select()}
          />
        )}
        <span className="max-sm:w-full max-sm:[&>button]:w-full">{copyButton(made)}</span>
      </div>
    </div>
  );

  const rowMenu = (row: VettingInvite, tr: ReactElement) => (
    <RowActionsMenu
      name={row.label}
      onCloseAutoFocus={onCloseAutoFocus}
      items={
        <>
          <MenuItem onSelect={() => void copy(row)}>{t('vetting.invites.copy')}</MenuItem>
          <MenuItem onSelect={() => run(() => askRevoke(row))}>
            {t('vetting.invites.revoke')}
          </MenuItem>
        </>
      }
    >
      {tr}
    </RowActionsMenu>
  );

  const columns: DataTableColumn<VettingInvite>[] = [
    {
      id: 'label',
      header: t('vetting.invites.columns.label'),
      primary: true,
      render: (row) => <span className="font-semibold break-words">{row.label}</span>,
    },
    {
      id: 'by',
      header: t('vetting.invites.columns.by'),
      render: (row) => row.createdBy.name,
    },
    {
      id: 'when',
      header: t('vetting.invites.columns.when'),
      className: 'whitespace-nowrap text-text-dim tabular-nums',
      render: (row) => formatDateOnly(new Date(row.createdAt), timeZone),
    },
    {
      id: 'uses',
      header: t('vetting.invites.columns.uses'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.uses,
    },
    {
      id: 'copy',
      header: '',
      align: 'right',
      stackEdge: 'end',
      // On a card: its own row at the foot, the button at its natural width.
      cellClassName: () => 'dt-action-row',
      render: (row) => copyButton(row, true),
    },
  ];

  return (
    <>
      <Modal
        open
        onClose={() => !busy && onClose()}
        title={t(mode === 'new' ? 'vetting.newInvite' : 'vetting.invites.title')}
        placement={mode === 'list' ? (phone ? 'sheet-full' : 'detail') : phone ? 'sheet' : 'center'}
        dismissOnOutsidePress={false}
        initialFocusRef={mode === 'new' ? labelRef : undefined}
        footer={
          <div className="flex justify-end max-sm:[&>button]:w-full">
            <Button variant="ghost" onClick={onClose}>
              {t('vetting.invites.close')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 text-sm">
          {mode === 'list' && (
            <>
              {!inviteOnly && (
                <p className="text-xs text-text-dim">{t('vetting.invites.publicNote')}</p>
              )}
              {invites.length === 0 ? (
                <EmptyState
                  title={t('vetting.invites.emptyTitle')}
                  hint={t('vetting.invites.emptyHint')}
                />
              ) : (
                <div className="-mx-3 border-y border-line">
                  <DataTable
                    label={t('vetting.invites.title')}
                    columns={columns}
                    rows={invites}
                    rowKey={(row) => row.code}
                    rowContextMenu={rowMenu}
                    rowMoreActions
                  />
                </div>
              )}
            </>
          )}
          {form}
          {madeLink}
        </div>
        <LiveStatus>{copied !== null ? t('vetting.copied') : ''}</LiveStatus>
      </Modal>
      <ConfirmDialog
        open={revoking !== null}
        title={t('vetting.invites.revokeConfirm.title')}
        body={t('vetting.invites.revokeConfirm.body', { label: revoking?.label ?? '' })}
        actionLabel={t('vetting.invites.revoke')}
        cancelLabel={t('common.cancel')}
        failedLabel={t('vetting.errors.generic')}
        onConfirm={async () => {
          if (revoking === null) return;
          await onRevoke(revoking.code);
          if (made?.code === revoking.code) setMade(null);
        }}
        onClose={() => setRevoking(null)}
        // The ⋮ that opened it goes with the revoked row.
        returnFocusFallback={() => firstConnected(afterRevoke.current)}
      />
    </>
  );
}
