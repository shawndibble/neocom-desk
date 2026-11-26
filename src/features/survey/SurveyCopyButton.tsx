import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SplitButtonChevron,
} from '@/components/ui';
import { CopyToClipboard } from '@/components/ui/icons';

export type CopyOutcome = { what: 'chat' | 'link'; result: 'copied' | 'failed' } | null;

interface SurveyCopyButtonProps {
  onCopyChat: () => void;
  onCopyLink: () => void;
  onConfigure: () => void;
  outcome: CopyOutcome;
}

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
          <SplitButtonChevron size="sm" label={t('survey.moreCopy')} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem onSelect={onConfigure}>{t('survey.configureChat')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopyLink}>{t('survey.copyLink')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
