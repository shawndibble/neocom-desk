import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useUrlParam } from '@/lib/useUrlState';
import { intParam } from '@/lib/urlState';

const DRILL_PARAM = intParam(0);

export function useWalletDrill() {
  const { t } = useTranslation();
  const [drilledId, setDrilledId] = useUrlParam('drill', DRILL_PARAM);
  const focusAfterCommit = useFocusAfterCommit();
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const drillInto = useCallback(
    (id: number) => {
      setDrilledId(id, { push: true });
      focusAfterCommit(backButtonRef);
    },
    [setDrilledId, focusAfterCommit]
  );
  const leaveDrill = useCallback(() => {
    setDrilledId(0, { push: true });
    focusAfterCommit(
      () =>
        document.querySelector<HTMLElement>(
          `[aria-label="${CSS.escape(t('wallet.balanceByCharacter'))}"] [data-row-key="${drilledId}"]`
        ),
      () => (backButtonRef.current?.isConnected ? null : panelHeadingRef.current)
    );
  }, [setDrilledId, focusAfterCommit, drilledId, t]);
  const clearDrill = useCallback(() => setDrilledId(0), [setDrilledId]);
  return { drilledId, drillInto, leaveDrill, clearDrill, backButtonRef, panelHeadingRef };
}
