import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType, type Location } from 'react-router-dom';
import {
  entityInfoHref,
  infoTabHref,
  parseEntityInfo,
  parseInfoTab,
  withoutEntityInfo,
} from '@/lib/entityInfo';
import { usePageLeave } from '@/lib/usePageLeave';
import { registerEntityInfoNavigator } from '@/stores/entityInfoNavigator';
import { useItemInfoModalStore } from '@/stores/itemInfoModal';
import { usePlaceInfoModalStore } from '@/stores/placeInfoModal';
import { usePublicInfoModalStore } from '@/stores/publicInfoModal';
import { useSkillDetailModalStore } from '@/stores/skillDetailModal';

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
            navigate(href);
          }
        },
        setTab: (tab) => {
          const here = locationRef.current;
          if (parseEntityInfo(here.search) === null) return;
          navigate(infoTabHref(here, tab), { replace: true, state: here.state });
        },
        close: () => {
          const here = locationRef.current;
          if (parseEntityInfo(here.search) === null) {
            usePublicInfoModalStore.getState().clear();
            useSkillDetailModalStore.getState().clear();
            useItemInfoModalStore.getState().clear();
            usePlaceInfoModalStore.getState().clear();
          } else {
            navigate(`${here.pathname}${withoutEntityInfo(here.search)}${here.hash}`, {
              replace: true,
            });
          }
        },
      }),
    [navigate]
  );

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
  const infoTab = parseInfoTab(location.search);
  useEffect(() => {
    usePublicInfoModalStore.getState().showTab(kind === null ? null : infoTab);
  }, [kind, id, infoTab]);
  useEffect(() => {
    const publicInfo = usePublicInfoModalStore.getState();
    const skill = useSkillDetailModalStore.getState();
    const item = useItemInfoModalStore.getState();
    const place = usePlaceInfoModalStore.getState();
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
      skill.stage(id, undefined);
    } else if (kind === 'place') {
      place.show({ id });
    } else {
      publicInfo.show({ kind, id });
    }
  }, [kind, id, itemId]);

  return null;
}
