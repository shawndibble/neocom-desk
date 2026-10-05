/**
 * Mounted once in `App.tsx`: keeps the URL's `?info=` param and the two
 * shared modals (`PublicInfoModal`, `SkillDetailModal`) in step.
 *
 * - `info` set (a link click, a pasted URL, Forward): the matching store's
 *   request is shown.
 * - `info` gone (Back, Close): both are cleared. Back therefore closes the
 *   modal with no extra code — the previous history entry has no `info`.
 * - The stores' `open`/`close` go through the navigator registered here, so a
 *   programmatic open makes the same history entry a link click does.
 *
 * Closing: an entry this app pushed carries `{ entityInfo: true }` in its
 * history state, so Close is `navigate(-1)` and Back/Close agree. An entry
 * with no marker — the URL opened cold in a new tab — is replaced by the same
 * URL without `info`, so Close never leaves the app. Opening while a modal is
 * already open (a drill-down from a character to its corporation) replaces
 * instead of pushing, so a single Close or Back always returns to the page.
 */
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { entityInfoHref, parseEntityInfo, withoutEntityInfo } from '@/lib/entityInfo';
import { registerEntityInfoNavigator } from '@/stores/entityInfoNavigator';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';
import { ENTITY_INFO_PUSHED_STATE, wasPushedHere } from './entityInfoState';

export function EntityInfoRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  });

  useEffect(
    () =>
      registerEntityInfoNavigator({
        open: (target) => {
          const here = locationRef.current;
          const alreadyOpen = parseEntityInfo(here.search) !== null;
          const href = entityInfoHref(here, target);
          if (alreadyOpen) {
            navigate(href, { replace: true, state: here.state });
          } else {
            navigate(href, { state: ENTITY_INFO_PUSHED_STATE });
          }
        },
        close: () => {
          const here = locationRef.current;
          if (parseEntityInfo(here.search) === null) {
            usePublicInfoModalStore.getState().clear();
            useSkillDetailModalStore.getState().clear();
          } else if (wasPushedHere(here.state)) {
            navigate(-1);
          } else {
            navigate(`${here.pathname}${withoutEntityInfo(here.search)}${here.hash}`, {
              replace: true,
            });
          }
        },
      }),
    [navigate]
  );

  const info = parseEntityInfo(location.search);
  const kind = info?.kind ?? null;
  const id = info?.id ?? null;
  useEffect(() => {
    const publicInfo = usePublicInfoModalStore.getState();
    const skill = useSkillDetailModalStore.getState();
    if (kind === null || id === null) {
      publicInfo.clear();
      skill.clear();
    } else if (kind === 'skill') {
      publicInfo.clear();
      const staged = skill.staged?.typeID === id ? skill.staged.planEntries : undefined;
      skill.show({ typeID: id, planEntries: staged });
    } else {
      skill.clear();
      publicInfo.show({ kind, id });
    }
  }, [kind, id]);

  return null;
}
