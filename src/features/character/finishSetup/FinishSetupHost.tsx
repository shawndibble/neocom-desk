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
