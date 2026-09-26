import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db } from '@/db';
import { ALERT_CHARACTER_PARAM } from '@/lib/alertCharacterParam';
import { parsePositiveInt } from '@/engine/market/urlState';
import { useActiveCharacter } from '@/stores/activeCharacter';

const STATUS_MS = 5000;

/**
 * Tapping an alert (feed row or push notification) for an alt lands with
 * `?character=<id>`. Makes that Character active, drops the param, and says so
 * — the pages read the active Character, so without this an alt's alert showed
 * the active pilot's data. Already-active, unknown or removed Characters just
 * lose the param: no switch, no status line.
 */
export function AlertCharacterSwitch() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const [switchedTo, setSwitchedTo] = useState<string | null>(null);
  // The strip runs after an async lookup; it must remove the param from the URL
  // as it is *then* (the page may have spent its own `?highlight=` meanwhile).
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  });

  const requested = parsePositiveInt(
    new URLSearchParams(location.search).get(ALERT_CHARACTER_PARAM)
  );
  const present = new URLSearchParams(location.search).has(ALERT_CHARACTER_PARAM);

  useEffect(() => {
    if (!present || !hydrated) return;
    let cancelled = false;
    void (async () => {
      const { activeCharacterId, setActiveCharacter } = useActiveCharacter.getState();
      if (requested !== null && requested !== activeCharacterId) {
        const character = await db.characters.get(requested);
        if (cancelled) return;
        if (character) {
          await setActiveCharacter(requested);
          if (cancelled) return;
          setSwitchedTo(character.name);
        }
      }
      const { pathname, search, hash } = locationRef.current;
      const params = new URLSearchParams(search);
      params.delete(ALERT_CHARACTER_PARAM);
      const query = params.toString();
      navigate(`${pathname}${query ? `?${query}` : ''}${hash}`, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [present, requested, hydrated, navigate]);

  useEffect(() => {
    if (switchedTo === null) return;
    const timer = setTimeout(() => setSwitchedTo(null), STATUS_MS);
    return () => clearTimeout(timer);
  }, [switchedTo]);

  if (switchedTo === null) return null;
  return (
    <p role="status" className="mb-4 rounded-xs border border-line bg-panel px-3 py-1 text-xs">
      {t('alerts.switchedTo', { name: switchedTo })}
    </p>
  );
}
