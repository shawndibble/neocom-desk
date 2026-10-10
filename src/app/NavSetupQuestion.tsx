import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Checkbox, Modal } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { answerNavSetup, useHiddenNav, useNavSetupAnswered } from './navPreferences';
import { NAV_ACTIVITIES } from './navRail';

const ACTIVITY_LABELS = {
  mining: 'nav.setup.activity.mining',
  pi: 'nav.setup.activity.pi',
  trading: 'nav.setup.activity.trading',
  industry: 'nav.setup.activity.industry',
  social: 'nav.setup.activity.social',
  intel: 'nav.setup.activity.intel',
} as const satisfies Record<(typeof NAV_ACTIVITIES)[number]['id'], string>;

/**
 * The rail's first-run question (scope decision
 * `20261009-163837-pinned-rail-alerts-bell-pilot-lookup-back-under`): asked
 * once per account, once a Character is signed in and both stores have been
 * read — before that the flag's default would flash it on every cold load.
 * Closing it any way is skipping, which gives the default set.
 */
export function NavSetupQuestion() {
  const { t } = useTranslation();
  const signedIn = useActiveCharacter((state) => state.activeCharacterId !== null);
  const answered = useNavSetupAnswered((state) => state.value);
  const answeredReady = useNavSetupAnswered((state) => state.hydrated);
  const hiddenReady = useHiddenNav((state) => state.hydrated);
  const ready = answeredReady && hiddenReady;
  const [picked, setPicked] = useState<readonly string[]>([]);
  if (!signedIn || !ready || answered) return null;

  const toggle = (id: string) =>
    setPicked((now) => (now.includes(id) ? now.filter((entry) => entry !== id) : [...now, id]));

  return (
    <Modal open onClose={() => void answerNavSetup([])} title={t('nav.setup.title')}>
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-text-dim">{t('nav.setup.hint')}</p>
        <ul className="flex flex-col gap-1">
          {NAV_ACTIVITIES.map((activity) => (
            <li key={activity.id}>
              <label className="flex min-h-11 items-center gap-2">
                <Checkbox
                  checked={picked.includes(activity.id)}
                  onChange={() => toggle(activity.id)}
                />
                {t(ACTIVITY_LABELS[activity.id])}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => void answerNavSetup([])}>
            {t('nav.setup.skip')}
          </Button>
          <Button onClick={() => void answerNavSetup(picked)} disabled={picked.length === 0}>
            {t('nav.setup.done')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
