/**
 * Mounts "Finish setting up {character}" in the shell (issue #6103). A sign-in
 * that lands leaves an `offer` behind (`offerFinishSetup`); this works out the
 * Character's remaining approvals and shows the step only when there is one.
 * After Continue, each EVE round trip returns to the page it was pressed on,
 * with its result as router state, and this records it and reopens the step on
 * the next item. Nothing leaves for EVE without a press.
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { beginAddCharacterLogin, beginAlertsLogin, beginOwnCorpGrantLogin } from '@/app/loginFlow';
import {
  currentApproval,
  startFinishSetup,
  type FinishSetupChain,
} from '@/engine/character/finishSetup';
import { utcDay } from '@/engine/localDay';
import { FinishSetupDialog } from './FinishSetupDialog';
import {
  finishSetupViewOnArrival,
  type ArrivalState,
  type FinishSetupView,
} from './finishSetupArrival';
import { clearFinishSetup, rememberNotNow, saveFinishSetupChain } from './finishSetupStore';

type View = FinishSetupView | null;

export function FinishSetupHost() {
  const location = useLocation();
  const [view, setView] = useState<View>(null);
  useEffect(() => {
    let cancelled = false;
    void finishSetupViewOnArrival(location.state as ArrivalState).then((next) => {
      if (!cancelled && next) setView(next);
    });
    return () => {
      cancelled = true;
    };
    // Once per arrival: each EVE return is a new location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  if (!view) return null;
  const close = () => {
    clearFinishSetup();
    setView(null);
  };
  const go = async (chain: FinishSetupChain) => {
    const cur = currentApproval(chain);
    if (cur?.kind === 'moon') {
      return beginOwnCorpGrantLogin({
        characterId: cur.editorCharacterId,
        expectedCeoCharacterId: chain.characterId,
        collectorCorporationId: cur.collectorCorporationId,
        feederCorporationId: cur.corporationId,
        // Outside a run the corp counts from today; the step says so.
        coverageFrom: utcDay(),
      });
    }
    if (cur?.kind === 'alerts') {
      return beginAlertsLogin(chain.characterId, {
        nearby: cur.nearby ?? false,
        mail: cur.mail ?? false,
      });
    }
  };
  return (
    <FinishSetupDialog
      key={view.chain.characterId}
      chain={view.chain}
      offering={view.offering}
      onContinue={(items) => {
        const chain = startFinishSetup({ ...view.chain, items });
        // An approval left unticked is a Not now for it.
        const unticked = view.chain.items.filter((i) => !items.includes(i)).map((i) => i.kind);
        if (unticked.length > 0) {
          void rememberNotNow(chain.characterId, unticked).catch(() => undefined);
        }
        saveFinishSetupChain(chain);
        setView({ offering: false, chain });
        return go(chain);
      }}
      onApprove={() => go(view.chain)}
      onNotNow={() => {
        void rememberNotNow(
          view.chain.characterId,
          view.chain.items.map((i) => i.kind)
        ).catch(() => undefined);
        close();
      }}
      onClose={close}
      onAddAnother={() => {
        close();
        void beginAddCharacterLogin();
      }}
    />
  );
}
