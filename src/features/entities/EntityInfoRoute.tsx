/**
 * Mounted once in `App.tsx`: keeps the URL's `?info=` param and the shared
 * modals (`PublicInfoModal`, `SkillDetailModal`, `ItemInfoModal`,
 * `PlaceInfoModal`) in step.
 *
 * - `info` set (a link click, a pasted URL, Forward): the matching store's
 *   request is shown.
 * - `info` gone (Back, Close): all are cleared. Back therefore closes the
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
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';
import { entityInfoHref, parseEntityInfo, withoutEntityInfo } from '@/lib/entityInfo';
import { usePageLeave } from '@/lib/usePageLeave';
import { registerEntityInfoNavigator } from '@/stores/entityInfoNavigator';
import { useItemInfoModalStore } from '@/stores/itemInfoModal';
import { usePlaceInfoModalStore } from '@/stores/placeInfoModal';
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
            useItemInfoModalStore.getState().clear();
            usePlaceInfoModalStore.getState().clear();
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

  // A tab switch keeps the search, so `info` would outlive the page the modal
  // was opened on (the modals close on a page change): strip it. A redirect
  // is not a page change (`usePageLeave`), so a cold `/market?info=type-34`
  // keeps its modal through the landing on `/market/browser`. Back or Forward
  // onto an entry that has `info` is the pilot returning to that modal (from a
  // Route Safety link inside it, say), so that entry keeps it.
  const navigationType = useNavigationType();
  usePageLeave(
    useCallback(
      (left: Location) => {
        if (navigationType === 'POP' || parseEntityInfo(left.search) === null) return;
        navigate(`${left.pathname}${withoutEntityInfo(left.search)}${left.hash}`, {
          replace: true,
        });
      },
      [navigate, navigationType]
    )
  );

  const info = parseEntityInfo(location.search);
  const kind = info?.kind ?? null;
  const id = info?.id ?? null;
  const itemId = info?.itemId;
  useEffect(() => {
    const publicInfo = usePublicInfoModalStore.getState();
    const skill = useSkillDetailModalStore.getState();
    const item = useItemInfoModalStore.getState();
    const place = usePlaceInfoModalStore.getState();
    // Only the modal `info` names stays open.
    if (
      kind !== 'character' &&
      kind !== 'corporation' &&
      kind !== 'alliance' &&
      kind !== 'faction'
    ) {
      publicInfo.clear();
    }
    if (kind !== 'skill') skill.clear();
    if (kind !== 'type') item.clear();
    if (kind !== 'place') place.clear();
    if (kind === null || id === null) return;
    if (kind === 'type') {
      const staged = item.staged;
      item.show({
        typeId: id,
        itemName: staged?.typeId === id ? staged.itemName : undefined,
        itemId,
      });
      item.stage(id, undefined);
    } else if (kind === 'skill') {
      const staged = skill.staged?.typeID === id ? skill.staged.planEntries : undefined;
      skill.show({ typeID: id, planEntries: staged });
      // Consumed: a later open must not inherit them.
      skill.stage(id, undefined);
    } else if (kind === 'place') {
      place.show({ id });
    } else {
      publicInfo.show({ kind, id });
    }
  }, [kind, id, itemId]);

  return null;
}
