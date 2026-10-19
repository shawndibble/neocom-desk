import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useUrlParam } from '@/lib/useUrlState';
import { intParam } from '@/lib/urlState';

/**
 * `?drill=<id>`: the Character the net worth view is drilled into; 0 = none. Not
 * `?character=`: that param is the alert deep link, which `AlertCharacterSwitch`
 * strips and turns into an active-Character switch.
 */
const DRILL_PARAM = intParam(0);

/** Drilling into one Character is route state, so the browser Back button undoes it. */
export function useWalletDrill() {
  const { t } = useTranslation();
  const [drilledId, setDrilledId] = useUrlParam('drill', DRILL_PARAM);
  // The drill swaps one panel for another, so the focused row or button is
  // removed; hand focus to its counterpart in the panel that replaces it.
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
      // The old drilled panel's heading is still mounted until the route
      // commits, so only fall back to it once the back button is gone.
      () => (backButtonRef.current?.isConnected ? null : panelHeadingRef.current)
    );
  }, [setDrilledId, focusAfterCommit, drilledId, t]);
  return { drilledId, drillInto, leaveDrill, backButtonRef, panelHeadingRef };
}
