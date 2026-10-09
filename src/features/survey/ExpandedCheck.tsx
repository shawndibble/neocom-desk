/**
 * Asked before a pilot's first scan joins a Survey that shows an ore the paste
 * lacks. The scanner prints nothing for a collapsed ore group, so a missing ore
 * is usually a section left closed, and the board would count it as mined out.
 */
import { Trans, useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

interface ExpandedCheckProps {
  ores: string[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function ExpandedCheck({ ores, onConfirm, onCancel }: ExpandedCheckProps) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('survey.expandedCheckLabel')}
      className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel/85 p-3"
    >
      <p className="mr-auto text-sm">
        <Trans
          i18nKey="survey.expandedCheck"
          count={ores.length}
          values={{ ores: ores.join(', ') }}
          components={{ b: <strong /> }}
        />
      </p>
      <Button variant="primary" size="sm" onClick={onConfirm}>
        {t('survey.allExpanded')}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel}>
        {t('survey.cancelUpload')}
      </Button>
    </div>
  );
}
