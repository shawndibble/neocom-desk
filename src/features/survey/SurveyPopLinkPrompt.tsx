import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { InlineError } from '@/components/ui/InlineError';
import type { InfoLocation } from '@/engine/survey/infoTemplate';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { dismissPopLink, useDismissedPopLinks } from './surveyPref';
import { usePopLinkPrompt, type PopLinkOption } from './usePopLinkPrompt';

const MAX_OPTIONS = 8;

export function SurveyPopLinkPrompt({
  surveyId,
  oreNames,
  location,
}: {
  surveyId: string;
  oreNames: readonly string[];
  location: InfoLocation | null;
}) {
  const { t } = useTranslation();
  const hydrated = useHydratedStore(useDismissedPopLinks);
  const dismissed = useDismissedPopLinks((s) => s.value);
  const setDismissed = useDismissedPopLinks((s) => s.setValue);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const prompt = usePopLinkPrompt({
    surveyId,
    oreNames,
    location,
    enabled: hydrated && !dismissed.includes(surveyId),
  });
  if (!prompt || prompt.options.length === 0) return null;

  const options = prompt.options.slice(0, MAX_OPTIONS);
  const target: PopLinkOption | undefined = prompt.strong ?? options.find((o) => o.id === picked);
  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await prompt.link(target.id);
    } finally {
      setBusy(false);
    }
  };
  const label = (o: PopLinkOption) =>
    t('survey.popLink.option', { title: o.title, corp: o.corporation });

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      {prompt.strong ? (
        <span>
          {t('survey.popLink.prompt', {
            title: prompt.strong.title,
            corp: prompt.strong.corporation,
          })}
        </span>
      ) : (
        <>
          <span>{t('survey.popLink.pickPrompt')}</span>
          <Select value={picked ?? undefined} onValueChange={setPicked}>
            <SelectTrigger aria-label={t('survey.popLink.pick')} size="sm" className="min-w-0">
              <SelectValue placeholder={t('survey.popLink.pick')} />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {label(o)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}
      <Button size="sm" variant="accent" disabled={!target || busy} onClick={() => void submit()}>
        {t('survey.popLink.link')}
      </Button>
      <Button size="sm" onClick={() => void setDismissed(dismissPopLink(dismissed, surveyId))}>
        {t(prompt.strong ? 'survey.popLink.notThisOne' : 'survey.popLink.notThese')}
      </Button>
      {prompt.linkFailed && <InlineError>{t('survey.popLink.failed')}</InlineError>}
    </div>
  );
}
