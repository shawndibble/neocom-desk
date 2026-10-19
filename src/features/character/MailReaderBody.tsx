import type { Ref, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Spinner } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { CharacterLink } from '@/features/entities';
import { StandingTag } from '@/features/character/StandingTag';
import { MailComposeBox } from '@/features/character/MailComposeBox';
import { MailBodyView } from '@/features/character/MailBodyView';
import type { MailRow } from '@/features/character/mailDisplay';
import { characterStanding } from '@/features/character/entityStanding';
import { NO_STANDING_INDEX, type Snapshot } from '@/features/character/mailSnapshot';
import { formatTimestamp } from '@/lib/timestamp';
import type { ComposeKind } from '@/engine/mail/mail';
import type { CachedResult } from '@/esi/cache';
import type { CharacterAffiliation, MailBody, MailHeader } from '@/esi/endpoints';

interface MailReaderBodyProps {
  /** Focus target for a failed body load or "Try again"; see `useRetryFocus`. */
  bodyRetryRef: Ref<HTMLDivElement>;
  selectedKey: string | null;
  /** Whether the reading pane is on screen (a phone hides it behind the list). */
  readerVisible: boolean;
  /** `undefined` while loading, `null` when it could not be read. */
  body: CachedResult<MailBody> | null | undefined;
  bodyText: string;
  online: boolean;
  readerHeadingRef: RefObject<HTMLElement | null>;
  onCompose: () => void;
  onRetry: () => void;
  selectedRow: MailRow | null;
  selectedOwner: Snapshot['owners'][number] | undefined;
  selectedSender: string;
  senderAffiliations: ReadonlyMap<number, CharacterAffiliation>;
  resolveRecipientName: (r: { recipient_id: number; recipient_type: string }) => string;
  composeKind: ComposeKind | null;
  timeZone: Parameters<typeof formatTimestamp>[1];
  onCloseCompose: () => void;
  onSent: (ownerId: number) => void;
}

/** The reading pane's content: empty hint, spinner, failed-load retry, or the open mail with its Reply/Forward box. */
export function MailReaderBody({
  bodyRetryRef,
  selectedKey,
  readerVisible,
  body,
  bodyText,
  online,
  readerHeadingRef,
  onCompose,
  onRetry,
  selectedRow,
  selectedOwner,
  selectedSender,
  senderAffiliations,
  resolveRecipientName,
  composeKind,
  timeZone,
  onCloseCompose,
  onSent,
}: MailReaderBodyProps) {
  const { t } = useTranslation();
  const selectedHeader: MailHeader | null = selectedRow?.header ?? null;
  const recipients = selectedHeader?.recipients ?? [];
  return (
    <div ref={bodyRetryRef} tabIndex={-1} className="min-w-0 focus:outline-none">
      {selectedKey === null ? (
        // Only while the pane is on screen: a phone hides it behind
        // the list (and floats its own Compose), and the inline
        // composer replaces it on a wide screen.
        readerVisible && (
          <EmptyState
            title={t('mail.readerEmptyTitle')}
            hint={t('mail.selectHint')}
            icon={<Icon.Social size={Icon.ICON_SIZE.lg} />}
            className="py-6"
            action={
              <Button size="sm" onClick={onCompose}>
                <Icon.MailCompose size={Icon.ICON_SIZE.sm} /> {t('mail.compose')}
              </Button>
            }
          />
        )
      ) : body === undefined ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" label={t('common.loading')} />
        </div>
      ) : body === null ? (
        // Still gets the reader-heading focus target (issue #1485):
        // a failed/uncached body is the same "opening this mail
        // just changed the pane" transition as the success path
        // below, just with nothing to read yet.
        <div
          ref={(el) => {
            readerHeadingRef.current = el;
          }}
          tabIndex={-1}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <EmptyState
            title={online ? t('mail.bodyNotDownloadedOnline') : t('mail.bodyNotDownloaded')}
            className="py-4"
            action={
              <Button size="sm" onClick={onRetry}>
                {t('common.retry')}
              </Button>
            }
          />
        </div>
      ) : (
        <div className="min-w-0 space-y-2 text-xs">
          <h3
            ref={(el) => {
              readerHeadingRef.current = el;
            }}
            tabIndex={-1}
            className="text-base font-semibold break-words text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {body.data.subject || t('mail.noSubject')}
          </h3>
          <div className="space-y-0.5 border-b border-line pb-2 text-text-dim">
            <p className="flex flex-wrap items-center gap-1.5">
              {t('mail.from')}
              {selectedHeader?.from !== undefined ? (
                <>
                  <CharacterLink id={selectedHeader.from}>{selectedSender}</CharacterLink>
                  <StandingTag
                    standing={characterStanding(
                      selectedOwner?.standingIndex ?? NO_STANDING_INDEX,
                      selectedHeader.from,
                      senderAffiliations
                    )}
                  />
                </>
              ) : (
                <span className="text-text">{selectedSender}</span>
              )}
            </p>
            {selectedHeader !== null && recipients.length > 0 && (
              <p className="flex flex-wrap items-center gap-x-1">
                {t('mail.to')}
                {recipients.map((recipient, index) => (
                  <span key={`${recipient.recipient_type}-${recipient.recipient_id}`}>
                    {recipient.recipient_type === 'character' ? (
                      <CharacterLink id={recipient.recipient_id}>
                        {resolveRecipientName(recipient)}
                      </CharacterLink>
                    ) : (
                      resolveRecipientName(recipient)
                    )}
                    {index < recipients.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            )}
          </div>
          {/* The body renders from the raw markup (`MailBodyView` parses
            it to a safe tree: bold, colour, links, tables) on the
            reader's fixed dark surface; `bodyText` is only the
            flattened text the compose box quotes. `break-words`
            inside the view keeps an unbroken URL from pushing the
            pane sideways. */}
          <MailBodyView text={bodyText} markup={body?.data.body ?? undefined} />

          {composeKind !== null && selectedRow !== null && (
            <MailComposeBox
              key={`${selectedRow.key}:${composeKind}`}
              characterId={selectedRow.ownerId}
              kind={composeKind}
              header={selectedRow.header}
              bodyText={bodyText}
              bodyMarkup={body?.data.body ?? undefined}
              senderName={selectedSender}
              formattedTimestamp={
                selectedRow.header.timestamp
                  ? formatTimestamp(new Date(selectedRow.header.timestamp), timeZone)
                  : ''
              }
              resolveRecipientName={resolveRecipientName}
              onClose={onCloseCompose}
              onSent={() => onSent(selectedRow.ownerId)}
            />
          )}
        </div>
      )}
    </div>
  );
}
