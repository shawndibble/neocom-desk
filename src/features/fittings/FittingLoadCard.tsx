import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Panel } from '@/components/ui';
import { fieldBaseClassName } from '@/components/ui/controlStyles';
import type { EftUnresolvedItem } from '@/engine/fittings/eftLoader';
import type { ShareDecodeError } from './useFittingWorkspace';

interface FittingLoadCardProps {
  onLoad: (text: string) => Promise<void>;
  unresolved: EftUnresolvedItem[];
  shareError: ShareDecodeError | null;
  tooLargeToShare: boolean;
}

export function FittingLoadCard({
  onLoad,
  unresolved,
  shareError,
  tooLargeToShare,
}: FittingLoadCardProps) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    setLoading(true);
    try {
      await onLoad(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel title={t('fittings.load.title')}>
      <div className="space-y-3">
        <label className="block text-xs text-text-dim" htmlFor="fitting-load-text">
          {t('fittings.load.pasteLabel')}
        </label>
        <textarea
          id="fitting-load-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={10}
          placeholder={t('fittings.load.pastePlaceholder')}
          className={`${fieldBaseClassName} w-full p-2 font-mono text-xs`}
        />
        <Button
          size="md"
          variant="primary"
          onClick={() => void handleLoad()}
          disabled={loading || text.trim() === ''}
        >
          {t('fittings.load.button')}
        </Button>

        {shareError && (
          <p role="alert" className="text-xs text-danger">
            {t(`fittings.load.shareError.${shareError}`)}
          </p>
        )}
        {tooLargeToShare && (
          <p role="alert" className="text-xs text-warning">
            {t('fittings.load.tooLargeToShare')}
          </p>
        )}
        {unresolved.length > 0 && (
          <div className="rounded-xs border border-line bg-panel-2 p-2">
            <p className="mb-1 text-xs font-semibold text-text-dim uppercase">
              {t('fittings.load.unresolvedTitle', { count: unresolved.length })}
            </p>
            <ul className="space-y-1 text-xs text-text-dim">
              {unresolved.map((item, index) => (
                <li key={index}>
                  {t('fittings.load.unresolvedLine', {
                    line: item.line,
                    text: item.text,
                    reason: item.reason,
                  })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Panel>
  );
}
