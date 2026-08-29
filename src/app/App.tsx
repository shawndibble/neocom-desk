import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslation } from 'react-i18next';
import { configureEsi } from '@/esi/client';
import { getValidAccessToken } from '@/auth/session';
import { db } from '@/db';
import { Spinner } from '@/components/ui';
import { Login } from '@/routes/Login';
import { Callback } from '@/routes/Callback';
import { Characters } from '@/routes/Characters';
import { Overview } from '@/routes/Overview';
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
      <main className="flex min-h-screen items-center justify-center bg-bg">
        <Spinner label={t('common.loading')} />
      </main>
    );
  }
  return <Navigate to={characterCount > 0 ? '/characters' : '/login'} replace />;
}

export function App() {
  const hydrate = useActiveCharacter((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        <Route path="/" element={<Root />} />
        <Route path="/login" element={<Login />} />
        <Route path="/callback" element={<Callback />} />
        <Route element={<Layout />}>
          <Route path="/characters" element={<Characters />} />
          <Route path="/overview" element={<Overview />} />
        </Route>
        <Route path="/styleguide" element={<Styleguide />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ReloadPrompt />
    </BrowserRouter>
  );
}
