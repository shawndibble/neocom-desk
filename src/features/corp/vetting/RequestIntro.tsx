import { Trans, useTranslation } from 'react-i18next';
import { Panel, textActionClassName } from '@/components/ui';
import { CharacterAvatar } from '@/components/ui/CharacterAvatar';
import { cx } from '@/lib/cx';

export const CONSENT_ANCHOR = 'vetting-consent';

interface RequestIntroProps {
  asker: { characterId: number; name: string } | undefined;
  role: string;
  corporationName: string;
  ready: number;
  total: number;
}

function Step({ n, title, children }: { n: number; title: string; children: string }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="flex size-6 shrink-0 items-center justify-center rounded-full border border-line-bright text-xs font-semibold text-text-dim"
      >
        {n}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-text-dim">{children}</span>
      </span>
    </li>
  );
}

export function RequestIntro({ asker, role, corporationName, ready, total }: RequestIntroProps) {
  const { t } = useTranslation();
  const first = asker?.name.split(' ')[0];
  const left = total - ready;
  const signIn =
    total === 0
      ? t('vetting.request.intro.step1None')
      : left === 0
        ? t('vetting.request.intro.step1All', { count: total })
        : t('vetting.request.intro.step1Some', { ready, total, count: left });
  return (
    <Panel title={t('vetting.request.promotion', { role })}>
      <div className="space-y-4 text-sm">
        <div className="flex items-start gap-3">
          {asker && <CharacterAvatar characterId={asker.characterId} size="md" />}
          <p>
            <Trans
              i18nKey={asker ? 'vetting.request.intro.asked' : 'vetting.request.intro.askedAnon'}
              values={{ name: asker?.name, first, role, corp: corporationName }}
              components={{ b: <span className="font-semibold" /> }}
            />
          </p>
        </div>
        <ol className="space-y-3">
          <Step n={1} title={t('vetting.request.intro.step1')}>
            {signIn}
          </Step>
          <Step n={2} title={t('vetting.request.intro.step2')}>
            {t('vetting.request.intro.step2Body')}
          </Step>
          <Step n={3} title={t('vetting.request.intro.step3')}>
            {t('vetting.request.intro.step3Body')}
          </Step>
        </ol>
        <ul className="space-y-1 border-t border-line pt-3 text-xs text-text-dim">
          <li>{t('vetting.request.intro.factOnce')}</li>
          <li>{t('vetting.request.intro.factMail')}</li>
          <li>{t('vetting.request.intro.factSee')}</li>
          <li>
            <a href={`#${CONSENT_ANCHOR}`} className={cx(textActionClassName(), 'text-xs')}>
              {t('vetting.request.intro.terms')}
            </a>
          </li>
        </ul>
      </div>
    </Panel>
  );
}
