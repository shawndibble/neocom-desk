import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { db } from '@/db';
import { Layout } from '@/app/Layout';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { useDefaultCharacterFilter } from '@/features/character/defaultCharacterFilter';
import { configureEsi } from '@/esi/client';
import { configureActiveCharacter } from '@/esi/lane';
import { getAccessTokenReportingFailures } from '@/app/tokenProvider';
import { characterPortraitUrl } from '@/lib/eveImages';
import { installFixtureFetch, type FixtureRoute } from './fixtureFetch';
import { walletFixtureRoutes } from './esiFixtureRoutes';
import { SAMPLE_ACTIVE_CHARACTER, SAMPLE_CHARACTERS, samplePortraitDataUri } from './sampleData';
import { HOUR_MS } from '@/lib/age';

/** Scopes the sample Characters hold: enough for the wallet pages, nothing that makes the shell poll more. */
const SAMPLE_SCOPES = ['esi-wallet.read_character_wallet.v1', 'esi-characters.read_loyalty.v1'];

export interface AppShellParameters {
  /** Where the page sits, e.g. `/wallet/balance`. */
  path: string;
  /** ESI answers for this page; defaults to the wallet routes. Keep the reference stable (module-level). */
  routes?: () => FixtureRoute[];
  /** Scopes the sample Characters hold; defaults to the wallet's. Keep the reference stable (module-level). */
  scopes?: readonly string[];
  /** Writes the page's own Dexie rows after the sample account is seeded. Keep the reference stable (module-level). */
  seed?: () => Promise<void>;
}

declare module 'storybook/internal/csf' {
  interface Parameters {
    shell?: AppShellParameters;
  }
}

/** `App.tsx` wires these at module load; a story renders without `App`, so the shell does it. */
function wireEsiToStoredTokens() {
  configureEsi({ getToken: (characterId) => getAccessTokenReportingFailures(characterId) });
  configureActiveCharacter(() => useActiveCharacter.getState().activeCharacterId);
}

async function seedSampleAccount(
  isCancelled: () => boolean,
  scopes: readonly string[],
  seed?: () => Promise<void>
) {
  await Promise.all([
    db.characters.clear(),
    db.tokens.clear(),
    db.settings.clear(),
    db.esiCache.clear(),
    db.esiCacheMeta.clear(),
  ]);
  if (isCancelled()) return;
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });
  useDefaultCharacterFilter.setState({ value: 'current', hydrated: false });

  await db.characters.bulkPut(
    SAMPLE_CHARACTERS.map(({ characterId, name }, index) => ({
      characterId,
      name,
      ownerHash: `sample-owner-${characterId}`,
      addedAt: index + 1,
    }))
  );
  await db.tokens.bulkPut(
    SAMPLE_CHARACTERS.map(({ characterId }) => ({
      characterId,
      accessToken: 'sample-access-token',
      refreshToken: 'sample-refresh-token',
      expiresAt: Date.now() + HOUR_MS,
      scopes: [...scopes],
    }))
  );
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: SAMPLE_ACTIVE_CHARACTER.characterId });
  if (isCancelled()) return;
  await seed?.();
  if (isCancelled()) return;
  // `App`'s Root does this at boot; the shell stands in for it.
  await useActiveCharacter.getState().hydrate();
}

const PORTRAIT_PATH = /^\/characters\/(\d+)\/portrait$/;

/** Points a Character portrait at its offline tile, so the page makes no image request either. */
function localisePortrait(img: HTMLImageElement) {
  const url = new URL(img.src, document.baseURI);
  if (url.origin !== new URL(characterPortraitUrl(0, 64)).origin) return;
  const match = PORTRAIT_PATH.exec(url.pathname);
  if (!match) return;
  const name = SAMPLE_CHARACTERS.find((c) => c.characterId === Number(match[1]))?.name ?? '?';
  img.src = samplePortraitDataUri(name);
}

function watchPortraits(root: ParentNode): () => void {
  root.querySelectorAll('img').forEach(localisePortrait);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
        localisePortrait(mutation.target);
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLImageElement) localisePortrait(node);
        else if (node instanceof Element) node.querySelectorAll('img').forEach(localisePortrait);
      });
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src'],
  });
  return () => observer.disconnect();
}

export function AppShell({ shell, children }: { shell: AppShellParameters; children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const routes = (shell.routes ?? walletFixtureRoutes)();
    wireEsiToStoredTokens();
    const uninstallFetch = installFixtureFetch(routes);
    const stopWatching = watchPortraits(document.body);
    void seedSampleAccount(() => cancelled, shell.scopes ?? SAMPLE_SCOPES, shell.seed).then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      setReady(false);
      stopWatching();
      uninstallFetch();
    };
  }, [shell.routes, shell.scopes, shell.seed]);

  if (!ready) return null;
  return (
    <div data-shell-ready>
      <MemoryRouter initialEntries={[shell.path]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<Suspense fallback={null}>{children}</Suspense>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </div>
  );
}
