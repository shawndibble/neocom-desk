/**
 * The details panel of the public Survey page for the device that started it
 * (`startedHere.ts`): location, moon tax and notes, stored on the Survey as they are
 * set, with or without an account. Anyone else on the page gets the read-only
 * `SurveyInfoReadout`. A change is stored when focus leaves the form or a place or
 * payee is picked, never per keystroke, since every store is a new doc; what was
 * already stored is not stored again.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel } from '@/components/ui';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { SurveyDetailsFields } from './SurveyDetailsFields';
import { parseTaxPct } from './moonTaxPayee';
import {
  setSurveyInfo,
  setSurveyTax,
  type SurveyInfoShare,
  type SurveyTaxShare,
} from './surveyStore';

type Place = NonNullable<SurveyInfoShare['location']>;

export function SurveyStarterDetails({
  id,
  expiresAt,
  info,
  tax,
  onStored,
}: {
  id: string;
  expiresAt: number;
  info: SurveyInfoShare | null;
  tax: SurveyTaxShare | null;
  /** A store landed: the page re-reads the survey. */
  onStored: () => void;
}) {
  const { t } = useTranslation();
  const activeId = useActiveCharacter((state) => (state.hydrated ? state.activeCharacterId : null));
  const [place, setPlace] = useState<Place | null>(info?.location ?? null);
  const [payeeName, setPayeeName] = useState(tax?.name ?? '');
  const [rateText, setRateText] = useState(tax ? String(tax.pct) : '');
  const [notes, setNotes] = useState(info?.notes ?? '');
  // What is stored already, so a blur with nothing new (or a retry after a failure) adds no doc.
  const sentInfo = useRef(JSON.stringify([info?.location ?? null, info?.notes ?? '']));
  const sentTax = useRef(JSON.stringify(tax ? [tax.name, tax.pct] : null));
  const characterId = activeId ?? undefined;

  function commit(next: { place?: Place | null; payeeName?: string } = {}) {
    const location = next.place === undefined ? place : next.place;
    const trimmedNotes = notes.trim();
    const infoKey = JSON.stringify([location, trimmedNotes]);
    if (infoKey !== sentInfo.current) {
      const before = sentInfo.current;
      sentInfo.current = infoKey;
      void setSurveyInfo({ id, expiresAt, location, notes: trimmedNotes, characterId })
        .then(onStored)
        .catch(() => {
          if (sentInfo.current === infoKey) sentInfo.current = before;
        });
    }
    const name = (next.payeeName ?? payeeName).trim();
    const pct = parseTaxPct(rateText);
    if (name === '' || pct === null) return;
    const taxKey = JSON.stringify([name, pct]);
    if (taxKey === sentTax.current) return;
    const before = sentTax.current;
    sentTax.current = taxKey;
    void setSurveyTax({ id, expiresAt, name, pct, characterId })
      .then(onStored)
      .catch(() => {
        if (sentTax.current === taxKey) sentTax.current = before;
      });
  }

  return (
    <Panel title={t('survey.info.title')}>
      <SurveyDetailsFields
        place={place}
        payeeName={payeeName}
        rateText={rateText}
        notes={notes}
        characterId={activeId}
        placeNote={t('survey.start.starterNote')}
        onPlace={(picked) => {
          const next = picked === null ? null : { id: picked.id, name: picked.name };
          setPlace(next);
          commit({ place: next });
        }}
        onPayeeName={setPayeeName}
        onPayeePick={(match) => {
          setPayeeName(match.name);
          commit({ payeeName: match.name });
        }}
        onRate={setRateText}
        onNotes={setNotes}
        onCommit={commit}
      />
    </Panel>
  );
}
