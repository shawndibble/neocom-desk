import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui';

const k = (key: string) => `corpTaxBook.moons.addCorps.${key}`;

export function NewCorpBanner({
  name,
  ceoName,
  onConnect,
  onNotNow,
  onDontAsk,
}: {
  name: string;
  ceoName: string;
  onConnect: () => void;
  onNotNow: () => void;
  onDontAsk: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xs border border-accent/40 bg-panel p-3"
    >
      <p className="min-w-0 text-sm">
        <span className="font-semibold">{t(k('bannerTitle'), { name })}</span>{' '}
        <span className="text-text-dim">{t(k('bannerHint'), { ceo: ceoName })}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onConnect}>
          {t(k('connectIt'))}
        </Button>
        <Button size="sm" onClick={onNotNow}>
          {t(k('notNow'))}
        </Button>
        <Button size="sm" onClick={onDontAsk}>
          {t(k('dontAsk'))}
        </Button>
      </div>
    </div>
  );
}

export function ResumeNotice({
  done,
  total,
  onContinue,
}: {
  done: number;
  total: number;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xs border border-accent/40 bg-panel p-3"
    >
      <p className="min-w-0 text-sm text-text-dim">{t(k('resumeHint'), { done, total })}</p>
      <Button size="sm" onClick={onContinue}>
        {t(k('resume'), { done, total })}
      </Button>
    </div>
  );
}
