/**
 * Invite links, for any reviewer: `mode="new"` is the small dialog the queue's header opens for
 * an invite-only corp (who the link is for, Create, then the link with Copy); `mode="list"` is
 * every live link with who made it, when, how often it was used, Copy link and Revoke, and the
 * same form under it. A link is `<origin>/apply/<corporationId>?invite=<code>`.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  LiveStatus,
  Modal,
  TextInput,
  type DataTableColumn,
} from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
  const copyButton = (invite: VettingInvite, size?: 'sm') => (
    <Button
      size={size}
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

  const rowActions = (row: VettingInvite) => (
    <>
      {copyButton(row, 'sm')}
      <Button
        size="sm"
        aria-label={t('vetting.invites.revokeNamed', { label: row.label })}
        onClick={() => setRevoking(row)}
      >
        {t('vetting.invites.revoke')}
      </Button>
    </>
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
      id: 'actions',
      header: '',
      align: 'right',
      render: (row) => <span className="flex justify-end gap-2">{rowActions(row)}</span>,
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
              ) : phone ? (
                // Two text buttons per row do not fit a stacked table card's corner: a plain list.
                <ul
                  aria-label={t('vetting.invites.title')}
                  className="divide-y divide-line border-y border-line"
                >
                  {invites.map((row) => (
                    <li key={row.code} className="space-y-2 py-2">
                      <div className="min-w-0">
                        <span className="block font-semibold break-words">{row.label}</span>
                        <span className="block text-xs text-text-dim tabular-nums">
                          {t('vetting.invites.phoneLine', {
                            by: row.createdBy.name,
                            when: formatDateOnly(new Date(row.createdAt), timeZone),
                            count: row.uses,
                          })}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 [&>button]:w-full">
                        {rowActions(row)}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="-mx-3 border-y border-line">
                  <DataTable
                    label={t('vetting.invites.title')}
                    columns={columns}
                    rows={invites}
                    rowKey={(row) => row.code}
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
      />
    </>
  );
}
