import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { CopyToClipboard, Expanded } from '@/components/ui/icons';

/** What the button last copied and how it went, for the label it flashes. */
export type CopyOutcome = { what: 'chat' | 'link'; result: 'copied' | 'failed' } | null;

interface SurveyCopyButtonProps {
  onCopyChat: () => void;
  onCopyLink: () => void;
  onConfigure: () => void;
  outcome: CopyOutcome;
}

/**
 * "Copy chat message" as one split button, like Save in Fittings: the button
 * is the everyday copy, and its caret lists the same link on its own, for a
 * pilot who wants the URL without the message around it, and the dialog that
 * configures the message.
 */
export function SurveyCopyButton({
  onCopyChat,
  onCopyLink,
  onConfigure,
  outcome,
}: SurveyCopyButtonProps) {
  const { t } = useTranslation();
  const label =
    outcome === null
      ? t('survey.chatMessage')
      : outcome.result === 'failed'
        ? t('survey.copyFailed')
        : outcome.what === 'chat'
          ? t('survey.copiedChat')
          : t('survey.copiedLink');
  return (
    <div className="flex">
      <Button
        variant="primary"
        size="sm"
        onClick={onCopyChat}
        aria-label={outcome === null ? t('survey.copyChat') : undefined}
        className="rounded-r-none"
      >
        {outcome === null && <CopyToClipboard aria-hidden />}
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            size="sm"
            aria-label={t('survey.moreCopy')}
            className="rounded-l-none border-l border-l-accent-contrast/30 px-2!"
          >
            <Expanded aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={onConfigure}>{t('survey.configureChat')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopyLink}>{t('survey.copyLink')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
