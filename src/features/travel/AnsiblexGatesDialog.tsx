/**
 * Route Safety's Ansiblex list (issue #2478): find the gates with each
 * character's structure search, paste a list, see what is known and remove
 * entries. The list is kept on this device only (`ansiblexGates.ts`).
 *
 * Each character's search finds only the gates that character can see, so
 * every character has its own Find, and each gate says who found it.
 * Conditions, never verdicts (decision `20260912-172628`): a gate is named
 * and placed, never judged.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { beginGrant } from '@/app/grantAction';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import { Button, Modal, TextArea, textActionClassName } from '@/components/ui';
import { db, type CharacterRecord } from '@/db';
import { parseGateList, type GateListError, type SystemLookup } from '@/engine/route/ansiblex';
import type { SolarSystemEntry } from '@/sde/marketTypes';
import {
  ANSIBLEX_SEARCH_ENDPOINTS,
  findGatesWithCharacter,
  removeAnsiblexGate,
  savePastedGates,
  useAnsiblexGates,
  type FindGatesOutcome,
} from './ansiblexGates';

/** Which way in the dialog was opened for: the paste box takes focus for `paste`. */
export type AnsiblexDialogMode = 'search' | 'paste';

/** Names to systems, case-insensitively, off the systems snapshot. */
function useSystemLookup(
  systems: ReadonlyMap<number, SolarSystemEntry> | null
): SystemLookup | null {
  return useMemo(() => {
    if (systems === null) return null;
    const byName = new Map<string, SolarSystemEntry>();
    for (const system of systems.values()) byName.set(system.name.toLowerCase(), system);
    return (name) => {
      const system = byName.get(name.trim().toLowerCase());
      return system ? { id: system.id, security: system.security } : undefined;
    };
  }, [systems]);
}

/** One character's search: not run yet, running, or what it came to. */
type SearchStatus = 'running' | FindGatesOutcome | undefined;

function CharacterSearchRow({
  character,
  status,
  disabled,
  onFind,
}: {
  character: CharacterRecord;
  status: SearchStatus;
  disabled: boolean;
  onFind: () => void;
}) {
  const { t } = useTranslation();
  const lacksScope = useCharacterLacksEndpoints(character.characterId, ANSIBLEX_SEARCH_ENDPOINTS);

  const lines: string[] = [];
  if (status === 'running') lines.push(t('travel.bridges.searching'));
  else if (status?.kind === 'failed') lines.push(t('travel.bridges.searchFailed'));
  else if (status?.kind === 'found') {
    lines.push(t('travel.bridges.found', { count: status.count }));
    if (status.unknown.length > 0) {
      lines.push(t('travel.bridges.foundUnknown', { names: status.unknown.join(', ') }));
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-semibold">{character.name}</span>
      {lacksScope ? (
        <>
          <span className="text-text-dim">{t('travel.bridges.needsGrant')}</span>
          <button
            type="button"
            className={textActionClassName()}
            onClick={() => void beginGrant(character.characterId, ANSIBLEX_SEARCH_ENDPOINTS)}
          >
            {t('travel.bridges.grant')}
          </button>
        </>
      ) : (
        <Button
          size="sm"
          disabled={disabled || status === 'running'}
          aria-label={t('travel.bridges.findLabel', { character: character.name })}
          onClick={onFind}
        >
          {t('travel.bridges.find')}
        </Button>
      )}
      {lines.length > 0 && (
        <span role="status" className="flex flex-wrap gap-x-1 text-text-dim">
          {lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </span>
      )}
    </li>
  );
}

function pasteErrorText(error: GateListError, t: ReturnType<typeof useTranslation>['t']): string {
  const names = error.names.join(', ');
  return t(`travel.bridges.pasteError.${error.reason}`, {
    line: error.line,
    text: error.text,
    names,
    count: error.names.length,
  });
}

export function AnsiblexGatesDialog({
  mode,
  systems,
  onClose,
}: {
  mode: AnsiblexDialogMode;
  systems: ReadonlyMap<number, SolarSystemEntry> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const characters = useLiveQuery(() => db.characters.toArray(), [], []);
  const gates = useAnsiblexGates() ?? [];
  const lookup = useSystemLookup(systems);
  const [pasted, setPasted] = useState('');
  const [pasteResult, setPasteResult] = useState<{
    added: number;
    errors: GateListError[];
  } | null>(null);
  const [searches, setSearches] = useState<ReadonlyMap<number, SearchStatus>>(new Map());
  const searching = [...searches.values()].includes('running');

  async function findWith(characterId: number) {
    if (lookup === null) return;
    const set = (status: SearchStatus) =>
      setSearches((was) => new Map(was).set(characterId, status));
    set('running');
    try {
      set(await findGatesWithCharacter(characterId, lookup));
    } catch {
      set({ kind: 'failed' });
    }
  }

  /** One character after another: their finds merge, each keeping who found it. */
  async function findWithEvery() {
    for (const character of characters) await findWith(character.characterId);
  }

  const nameOfCharacter = (id: number) =>
    characters.find((character) => character.characterId === id)?.name ??
    t('travel.bridges.unknownCharacter', { id });
  const nameOfSystem = (id: number) => systems?.get(id)?.name ?? t('travel.stops.unnamed', { id });

  async function addPasted() {
    if (lookup === null) return;
    const { gates: read, errors } = parseGateList(pasted, lookup);
    await savePastedGates(read);
    setPasteResult({ added: read.length, errors });
    if (errors.length === 0) setPasted('');
  }

  return (
    <Modal open onClose={onClose} title={t('travel.bridges.title')}>
      <div className="space-y-5 text-sm">
        <p className="text-text-dim">{t('travel.bridges.localOnly')}</p>

        <section className="space-y-2">
          <h3 className="font-semibold">{t('travel.bridges.searchTitle')}</h3>
          <p className="text-text-dim">{t('travel.bridges.searchHint')}</p>
          {characters.length === 0 ? (
            <p className="text-text-dim">{t('travel.bridges.noCharacters')}</p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {characters.map((character) => (
                  <CharacterSearchRow
                    key={character.characterId}
                    character={character}
                    status={searches.get(character.characterId)}
                    disabled={lookup === null || searching}
                    onFind={() => void findWith(character.characterId)}
                  />
                ))}
              </ul>
              {characters.length > 1 && (
                <Button
                  size="sm"
                  disabled={lookup === null || searching}
                  onClick={() => void findWithEvery()}
                >
                  {t('travel.bridges.findAll')}
                </Button>
              )}
            </>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">{t('travel.bridges.pasteTitle')}</h3>
          <TextArea
            aria-label={t('travel.bridges.pasteLabel')}
            placeholder={t('travel.bridges.pastePlaceholder')}
            rows={4}
            autoFocus={mode === 'paste'}
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
          />
          <Button
            size="sm"
            disabled={pasted.trim() === '' || lookup === null}
            onClick={() => void addPasted()}
          >
            {t('travel.bridges.pasteAdd')}
          </Button>
          {pasteResult && (
            <div role="status" className="space-y-1">
              <p>{t('travel.bridges.pasteAdded', { count: pasteResult.added })}</p>
              {pasteResult.errors.length > 0 && (
                <ul className="list-disc space-y-0.5 pl-5 text-danger">
                  {pasteResult.errors.map((error) => (
                    <li key={error.line}>{pasteErrorText(error, t)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="font-semibold">{t('travel.bridges.known', { count: gates.length })}</h3>
          {gates.length === 0 ? (
            <p className="text-text-dim">{t('travel.bridges.none')}</p>
          ) : (
            <ul className="space-y-1">
              {gates.map((gate) => (
                <li key={gate.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {t('travel.bridges.ends', {
                      from: nameOfSystem(gate.fromId),
                      to: nameOfSystem(gate.toId),
                    })}
                  </span>
                  <span className="min-w-0 truncate">{gate.name}</span>
                  <span className="text-text-dim">
                    {gate.source === 'paste'
                      ? t('travel.bridges.pasted')
                      : t('travel.bridges.foundBy', {
                          names: gate.foundBy.map(nameOfCharacter).join(', '),
                        })}
                  </span>
                  <button
                    type="button"
                    className={textActionClassName()}
                    aria-label={t('travel.bridges.removeLabel', { name: gate.name })}
                    onClick={() => void removeAnsiblexGate(gate.id)}
                  >
                    {t('travel.bridges.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
