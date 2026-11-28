import { useId, useMemo, useRef, useState } from 'react';
import { InlineError } from '@/components/ui/InlineError';
import { useTranslation } from 'react-i18next';
import {
  LiveNote,
  Button,
  FieldError,
  LiveStatus,
  Modal,
  NativeSelect,
  Checkbox,
  TextArea,
  TextInput,
  Tooltip,
  Field,
  Fields,
} from '@/components/ui';
import {
  MAX_LINES_PER_REQUEST,
  MAX_LOCATION_LENGTH,
  MAX_TERMS_LENGTH,
  defaultKind,
  isBlueprintName,
  lineKey,
  mergeLines,
  parseQuantity,
  type RequestLine,
  type RequestLineKind,
} from '@/engine/communities/requests';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import { matchAppraisalEntries, type AppraisalCatalogue } from '@/engine/market/appraisalMatch';
import { loadAppraisalCatalogue } from '@/features/market/appraisalData';
import { BuybackFields, type BuyerOption } from './BuybackFields';
import {
  draftFromStanding,
  draftToStanding,
  emptyBuybackDraft,
  type BuybackDraft,
} from './buybackDraft';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useAsyncLoad } from '@/lib/useAsyncLoad';
import { LocationPicker } from './LocationPicker';
import { callableErrorReason } from './callableError';
import { RequestNotifyChoice } from './RequestNotifyChoice';
import { editRequest, postRequest } from './requestStore';
import {
  DEFAULT_NOTIFY,
  type CommunityRequest,
  type RequestNotify,
} from '@/engine/communities/requests';
import { ItemSearchPicker } from './ItemSearchPicker';
import { DialogFooter } from '@/components/ui/DialogFooter';

export interface ComposePrefill {
  lines?: readonly RequestLine[];
}

export interface ComposeEditing {
  request: CommunityRequest;
  linesLocked: boolean;
}

interface LineEdit {
  quantity?: string;
  kind?: RequestLineKind;
  runs?: string;
  me?: string;
  te?: string;
}

export const POST_TIMEOUT_MS = 75_000;
const TIMED_OUT = Symbol('post timed out');

function optionalNumber(text: string | undefined, min: number, max: number) {
  const trimmed = (text ?? '').trim();
  if (trimmed === '') return { value: undefined, valid: true };
  const value = Number(trimmed);
  const valid = /^\d+$/.test(trimmed) && value >= min && value <= max;
  return { value: valid ? value : undefined, valid };
}

interface ResolvedLine {
  key: string;
  line: RequestLine;
  duplicate: boolean;
  quantityValid: boolean;
  specValid: boolean;
}

function resolveLine(base: RequestLine, edit: LineEdit | undefined): ResolvedLine {
  const quantity = edit?.quantity === undefined ? base.quantity : parseQuantity(edit.quantity);
  const kind = edit?.kind ?? base.kind;
  const runs = optionalNumber(edit?.runs, 1, 1_000_000);
  const me = optionalNumber(edit?.me, 0, 10);
  const te = optionalNumber(edit?.te, 0, 20);
  const line: RequestLine = { ...base, kind, quantity: quantity ?? 0 };
  if (kind === 'bpc') {
    if (runs.value !== undefined) line.runs = runs.value;
    if (me.value !== undefined) line.me = me.value;
    if (te.value !== undefined) line.te = te.value;
  }
  return {
    key: lineKey(base),
    line,
    duplicate: false,
    quantityValid: quantity !== null,
    specValid: kind !== 'bpc' || (runs.valid && me.valid && te.valid),
  };
}

export function ComposeRequestDialog({
  characterId,
  communityId,
  prefill,
  editing,
  buyers = [],
  onClose,
  onPosted,
}: {
  characterId: number;
  communityId: string;
  prefill?: ComposePrefill;
  editing?: ComposeEditing;
  buyers?: readonly BuyerOption[];
  onClose: () => void;
  onPosted: () => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [location, setLocation] = useState(editing?.request.location ?? '');
  const [terms, setTerms] = useState(editing?.request.terms ?? '');
  const [text, setText] = useState('');
  const [added, setAdded] = useState<RequestLine[]>(
    () => mergeLines([], editing?.request.lines ?? prefill?.lines ?? []).lines
  );
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [announce, setAnnounce] = useState<{ text: string; key: number }>({ text: '', key: 0 });
  const catalogueLoad = useAsyncLoad(loadAppraisalCatalogue);
  const catalogue: AppraisalCatalogue | null = catalogueLoad.data ?? null;
  const catalogueFailed = catalogueLoad.status === 'failed';
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notify, setNotify] = useState<RequestNotify>(editing?.request.notify ?? DEFAULT_NOTIFY);
  const searchRef = useRef<HTMLInputElement>(null);
  const [standingMode, setStandingMode] = useState(editing?.request.standing !== undefined);
  const [buyback, setBuyback] = useState<BuybackDraft>(() =>
    editing?.request.standing ? draftFromStanding(editing.request.standing) : emptyBuybackDraft()
  );
  const standing = standingMode ? draftToStanding(buyback) : null;

  const matches = useMemo(
    () =>
      catalogue && text.trim() !== ''
        ? matchAppraisalEntries(parseAppraisalPaste(text), catalogue)
        : { matched: [], unmatched: [] },
    [catalogue, text]
  );

  const { lines, over } = useMemo(() => {
    const pasted = matches.matched.map((m): RequestLine => ({
      typeId: m.typeId,
      name: m.name,
      quantity: m.quantity,
      kind: defaultKind(m.name),
    }));
    const kept = [...pasted, ...added].filter((line) => !removed.has(lineKey(line)));
    const merged = mergeLines([], kept);
    const resolved = merged.lines.map((line) => resolveLine(line, edits[lineKey(line)]));
    const counts = new Map<string, number>();
    for (const r of resolved) counts.set(lineKey(r.line), (counts.get(lineKey(r.line)) ?? 0) + 1);
    return {
      lines: resolved.map((r) => ({ ...r, duplicate: (counts.get(lineKey(r.line)) ?? 0) > 1 })),
      over: merged.dropped,
    };
  }, [matches, added, removed, edits]);

  const edit = (key: string, patch: LineEdit) =>
    setEdits((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

  const addItem = (item: { typeId: number; name: string }) => {
    const first = defaultKind(item.name);
    const kinds: RequestLineKind[] = isBlueprintName(item.name)
      ? [first, first === 'bpc' ? 'bpo' : 'bpc']
      : [first];
    const listed = (kind: RequestLineKind) =>
      lines.some(
        (l) =>
          l.key === lineKey({ typeId: item.typeId, kind }) ||
          lineKey(l.line) === lineKey({ typeId: item.typeId, kind })
      );
    const free = kinds.find((kind) => !listed(kind));
    if (free) {
      const line: RequestLine = { typeId: item.typeId, name: item.name, quantity: 1, kind: free };
      setRemoved((current) => {
        const next = new Set(current);
        next.delete(lineKey(line));
        return next;
      });
      setAdded((current) => mergeLines(current, [line]).lines);
    } else {
      const existing = lines.find((l) => l.line.typeId === item.typeId);
      if (existing) {
        edit(existing.key, { quantity: String(existing.line.quantity + 1) });
      }
    }
    setAnnounce((a) => ({
      text: t('communities.board.compose.added', { name: item.name }),
      key: a.key + 1,
    }));
    searchRef.current?.focus();
  };

  const invalid = lines.some((l) => !l.quantityValid || !l.specValid || l.duplicate);
  const canSubmit = standingMode ? standing !== null : lines.length > 0 && !invalid && over === 0;
  const linesLocked = editing?.linesLocked ?? false;

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await editRequest(characterId, communityId, editing.request.id, {
        location: location.trim(),
        terms: terms.trim(),
        lines: standingMode ? [] : lines.map((l) => l.line),
        notify,
        ...(standing ? { standing } : {}),
      });
    } catch (err) {
      const reason = callableErrorReason(err);
      setError(
        reason === 'lines-locked'
          ? t('communities.board.compose.linesLocked')
          : t('communities.board.compose.saveFailed')
      );
      setBusy(false);
      return;
    }
    onPosted();
    onClose();
  };

  const post = async () => {
    setBusy(true);
    setError(null);
    const draft = {
      location: location.trim(),
      terms: terms.trim(),
      lines: standingMode ? [] : lines.map((l) => l.line),
      notify,
      ...(standing ? { standing } : {}),
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        postRequest(characterId, communityId, draft),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(TIMED_OUT), POST_TIMEOUT_MS);
        }),
      ]);
    } catch (err) {
      const reason = err === TIMED_OUT ? null : callableErrorReason(err);
      setError(
        err === TIMED_OUT
          ? t('communities.board.compose.postTimedOut')
          : reason === 'too-many-open-requests'
            ? t('communities.board.tooManyOpen')
            : reason === 'too-many-lines'
              ? t('communities.board.compose.tooManyLines', { count: MAX_LINES_PER_REQUEST })
              : t('communities.board.compose.failed')
      );
      setBusy(false);
      return;
    } finally {
      clearTimeout(timer);
    }
    onPosted();
    onClose();
  };

  const unmatched = matches.unmatched.length;

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={t(
        editing
          ? standingMode
            ? 'communities.board.buyback.editTitle'
            : 'communities.board.compose.editTitle'
          : standingMode
            ? 'communities.board.buyback.title'
            : 'communities.board.compose.title'
      )}
      placement="wide"
      dirty={touched && !busy}
    >
      <form
        className="space-y-4 text-sm"
        onInput={() => setTouched(true)}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit || busy) return;
          if (editing) void save();
          else void post();
        }}
      >
        <div className="grid gap-3 md:grid-cols-2">
          <LocationPicker value={location} maxLength={MAX_LOCATION_LENGTH} onChange={setLocation} />
          <Fields variant="stacked">
            <Field label={t('communities.board.compose.terms')}>
              <TextInput
                value={terms}
                maxLength={MAX_TERMS_LENGTH}
                placeholder={t('communities.board.compose.termsPlaceholder')}
                onChange={(e) => setTerms(e.target.value)}
              />
            </Field>
          </Fields>
        </div>
        {!editing && (
          <label className={cx('flex items-start gap-2', tappableRowClassName)}>
            <Checkbox
              className="mt-0.5"
              checked={standingMode}
              onChange={(e) => setStandingMode(e.target.checked)}
            />
            <span>
              {t('communities.board.buyback.toggle')}
              <span className="block text-xs text-text-dim">
                {t('communities.board.buyback.toggleHint')}
              </span>
            </span>
          </label>
        )}
        {standingMode && (
          <BuybackFields
            draft={buyback}
            onChange={setBuyback}
            catalogue={catalogue}
            buyers={buyers}
            ownCharacterId={characterId}
          />
        )}
        {!standingMode && (
          <>
            {linesLocked && (
              <LiveNote className="text-xs text-text-dim">
                {t('communities.board.compose.linesLockedNote')}
              </LiveNote>
            )}
            {!linesLocked && (
              <Fields variant="stacked">
                <Field label={t('communities.board.compose.paste')}>
                  <TextArea
                    rows={4}
                    value={text}
                    aria-describedby={unmatched > 0 ? `${id}-unmatched` : undefined}
                    onChange={(e) => setText(e.target.value)}
                  />
                </Field>
              </Fields>
            )}
            {unmatched > 0 && (
              <p id={`${id}-unmatched`} className="text-xs text-warning">
                {t('communities.board.compose.unmatched', {
                  count: unmatched,
                  names: matches.unmatched.map((u) => u.name).join(', '),
                })}
              </p>
            )}
            {catalogueFailed && (
              <InlineError>{t('communities.board.compose.catalogueFailed')}</InlineError>
            )}
            {over > 0 && (
              <p className="text-xs text-warning">
                {t('communities.board.compose.over', { count: over, max: MAX_LINES_PER_REQUEST })}
              </p>
            )}
            {lines.length > 0 && (
              <ul
                aria-label={t('communities.board.linesLabel')}
                className="divide-y divide-line rounded-xs border border-line"
              >
                {lines.map(({ key, line, quantityValid, specValid, duplicate }) => {
                  const quantityErrorId = `${id}-q-${key}`;
                  const specErrorId = `${id}-s-${key}`;
                  const e = edits[key];
                  const blueprint = isBlueprintName(line.name);
                  return (
                    <li key={key} className="space-y-1.5 px-3 py-1.5">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{line.name}</span>
                        <TextInput
                          size="sm"
                          inputMode="numeric"
                          aria-label={t('communities.board.compose.quantityOf', {
                            name: line.name,
                          })}
                          aria-invalid={!quantityValid || undefined}
                          aria-describedby={!quantityValid ? quantityErrorId : undefined}
                          className="w-28 tabular-nums"
                          value={e?.quantity ?? String(line.quantity)}
                          onChange={(ev) => edit(key, { quantity: ev.target.value })}
                        />
                        {!linesLocked && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t('communities.board.compose.removeLine', {
                              name: line.name,
                            })}
                            onClick={() => {
                              setRemoved((current) => new Set(current).add(key));
                              setAnnounce((a) => ({
                                text: t('communities.board.compose.removed', { name: line.name }),
                                key: a.key + 1,
                              }));
                              searchRef.current?.focus();
                            }}
                          >
                            {t('communities.board.compose.remove')}
                          </Button>
                        )}
                      </div>
                      {blueprint && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-dim">
                          <NativeSelect
                            size="sm"
                            className="w-44"
                            aria-label={t('communities.board.compose.kindOf', { name: line.name })}
                            value={line.kind}
                            disabled={linesLocked}
                            onChange={(ev) =>
                              edit(key, { kind: ev.target.value as RequestLineKind })
                            }
                          >
                            <option value="bpc">{t('communities.board.compose.kindBpc')}</option>
                            <option value="bpo">{t('communities.board.compose.kindBpo')}</option>
                          </NativeSelect>
                          {line.kind === 'bpc' &&
                            (
                              [
                                ['runs', t('communities.board.compose.runs')],
                                ['me', t('communities.board.compose.me')],
                                ['te', t('communities.board.compose.te')],
                              ] as const
                            ).map(([field, label]) => (
                              <label key={field} className="flex items-center gap-1">
                                {label}
                                <TextInput
                                  size="sm"
                                  inputMode="numeric"
                                  aria-invalid={!specValid || undefined}
                                  aria-describedby={!specValid ? specErrorId : undefined}
                                  className="w-16 tabular-nums"
                                  value={
                                    e?.[field] ??
                                    (line[field] === undefined ? '' : String(line[field]))
                                  }
                                  onChange={(ev) => edit(key, { [field]: ev.target.value })}
                                />
                              </label>
                            ))}
                        </div>
                      )}
                      {!quantityValid && (
                        <FieldError id={quantityErrorId} className="block text-xs">
                          {t('communities.board.compose.quantityInvalid', { name: line.name })}
                        </FieldError>
                      )}
                      {line.kind === 'bpc' && !specValid && (
                        <FieldError id={specErrorId} className="block text-xs">
                          {t('communities.board.compose.specInvalid', { name: line.name })}
                        </FieldError>
                      )}
                      {duplicate && (
                        <InlineError>
                          {t('communities.board.compose.duplicate', { name: line.name })}
                        </InlineError>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!linesLocked && (
              <ItemSearchPicker
                catalogue={catalogue}
                inputRef={searchRef}
                label={t('communities.board.compose.addLabel')}
                placeholder={t('communities.board.compose.addPlaceholder')}
                resultsLabel={t('communities.board.compose.results')}
                onPick={addItem}
              />
            )}
          </>
        )}
        {!standingMode && <RequestNotifyChoice value={notify} onChange={setNotify} />}
        {error && <InlineError>{error}</InlineError>}
        <LiveStatus announceKey={announce.key}>{announce.text}</LiveStatus>
        <DialogFooter>
          <Button variant="ghost" aria-disabled={busy || undefined} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Tooltip content={!canSubmit ? t('common.needsInput') : null}>
            <Button
              variant="primary"
              type="submit"
              loading={busy}
              aria-disabled={!canSubmit || undefined}
            >
              {editing
                ? t('communities.board.compose.save')
                : t(
                    standingMode
                      ? 'communities.board.buyback.post'
                      : 'communities.board.compose.post'
                  )}
            </Button>
          </Tooltip>
        </DialogFooter>
      </form>
    </Modal>
  );
}
