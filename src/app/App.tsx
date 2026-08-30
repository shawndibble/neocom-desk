import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { configureEsi } from '@/esi/client';
import { getValidAccessToken } from '@/auth/session';
import { triggerSync } from '@/sync';
import { db } from '@/db';
import { isSyncConfigured } from './syncStatus';
import { Spinner } from '@/components/ui';
import { Login } from '@/routes/Login';
import { Callback } from '@/routes/Callback';
import { Characters } from '@/routes/Characters';
import { Overview } from '@/routes/Overview';
import { Skills } from '@/routes/Skills';
import { SkillPlans } from '@/routes/SkillPlans';
import { Industry } from '@/routes/Industry';
import { Market } from '@/routes/Market';
import { Wallet } from '@/routes/Wallet';
import { Assets } from '@/routes/Assets';
import { Mail } from '@/routes/Mail';
import { Calendar } from '@/routes/Calendar';
import { Contracts } from '@/routes/Contracts';
import { Orders } from '@/routes/Orders';
import { Styleguide } from '@/routes/Styleguide';
import { Layout } from './Layout';
import { ReloadPrompt } from './ReloadPrompt';
import { useActiveCharacter } from '@/stores/activeCharacter';

// Wire authenticated ESI calls to stored tokens once, at module load.
configureEsi({ getToken: (characterId) => getValidAccessToken(characterId) });

// '/neocom-desk/' on GitHub Pages, '/' in dev/tests.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

/** Index gate: characters exist -> /characters, none -> /login. */
function Root() {
  const { t } = useTranslation();
  const characterCount = useLiveQuery(() => db.characters.count());
  if (characterCount === undefined) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg text-text">
        <h1 className="text-sm font-semibold tracking-widest uppercase">{t('app.name')}</h1>
        <Spinner label={t('common.loading')} />
        <p className="text-xs text-text-dim">{t('common.loadingEllipsis')}</p>
      </main>
    );
  }
  return <Navigate to={characterCount > 0 ? '/characters' : '/login'} replace />;
}

export function App() {
  const hydrate = useActiveCharacter((state) => state.hydrate);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // Fire-and-forget: runs on app start (once hydration resolves an active
  // character) and again on every character switch. Errors (offline, no
  // Firebase config) are swallowed — surfaced instead via subscribeSyncStatus.
  useEffect(() => {
    if (activeCharacterId === null || !isSyncConfigured()) return;
    void triggerSync(activeCharacterId).catch(() => {});
  }, [activeCharacterId]);

  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route element={<Layout />}>
          <Route path="/characters" element={<Characters />} />
          <Route path="/overview" element={<Overview />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/skills/plans" element={<SkillPlans />} />
          <Route path="/industry" element={<Industry />} />
          <Route path="/market" element={<Market />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/mail" element={<Mail />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/orders" element={<Orders />} />
        </Route>
        <Route path="/styleguide" element={<Styleguide />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ReloadPrompt />
    </BrowserRouter>
  );
}
