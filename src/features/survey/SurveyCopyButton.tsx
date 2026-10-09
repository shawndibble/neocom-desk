import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui';
import { Expanded } from '@/components/ui/icons';

/** What the button last copied and how it went, for the label it flashes. */
export type CopyOutcome = { what: 'chat' | 'link'; result: 'copied' | 'failed' } | null;

interface SurveyCopyButtonProps {
  onCopyChat: () => void;
  onCopyLink: () => void;
  outcome: CopyOutcome;
  /** Stretch across the row, for a phone where it sits under the chart. */
  fill?: boolean;
}

/**
 * "Copy chat message" as one split button, like Save in Fittings: the button
 * is the everyday copy, and its caret lists the same link on its own, for a
 * pilot who wants the URL without the message around it. The message already
 * carries the link, so the menu holds nothing else.
 */
export function SurveyCopyButton({
  onCopyChat,
  onCopyLink,
  outcome,
  fill = false,
}: SurveyCopyButtonProps) {
  const { t } = useTranslation();
  const label =
    outcome === null
      ? t('survey.copyChat')
      : outcome.result === 'failed'
        ? t('survey.copyFailed')
        : outcome.what === 'chat'
          ? t('survey.copiedChat')
          : t('survey.copiedLink');
  return (
    <div className={fill ? 'flex w-full' : 'flex'}>
      <Button
        variant="primary"
        onClick={onCopyChat}
        className={fill ? 'flex-1 rounded-r-none' : 'rounded-r-none'}
      >
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            aria-label={t('survey.moreCopy')}
            className="rounded-l-none border-l border-l-accent-contrast/30 px-2"
          >
            <Expanded aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={onCopyLink}>{t('survey.copyLink')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
