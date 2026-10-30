import { useState } from 'react';
import {
  Button,
  CharacterAvatar,
  Field,
  Fields,
  Modal,
  PageHeader,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { TRADE_HUBS } from '@/market/hubs';
import { FOUR, type HubId, type MockCharacter, type Variant } from './tradeHubFixtures';
import { Collapse } from '@/components/ui/Collapse';
import { SettingsHint } from '@/features/settings/settingsFields';
import { SettingsNav } from '@/features/settings/SettingsNav';
import { visibleSettingsGroups } from '@/features/settings/sections';

const hubName = (id: HubId) => TRADE_HUBS.find((h) => h.id === id)?.systemName ?? id;

function HubSelect({
  value,
  onChange,
  label,
  id,
  size,
}: {
  value: HubId;
  onChange: (next: HubId) => void;
  label: string;
  id?: string;
  size?: 'md' | 'sm';
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as HubId)}>
      <SelectTrigger id={id} aria-label={label} size={size}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {TRADE_HUBS.map((hub) => (
          <SelectItem key={hub.id} value={hub.id}>
            {hub.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CharacterRows({
  characters,
  onChange,
}: {
  characters: readonly MockCharacter[];
  onChange: (id: number, hub: HubId) => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {characters.map((c) => (
        <li
          key={c.characterId}
          className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 sm:flex-nowrap"
        >
          <CharacterAvatar characterId={c.characterId} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
          <div className="w-full sm:w-80 [&_button]:w-full">
            <HubSelect
              size="sm"
              value={c.hub}
              label={`Trade Hub for ${c.name}`}
              onChange={(hub) => onChange(c.characterId, hub)}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "2 on Jita, 1 on Hek, 1 on Amarr": the whole per-character state in one line. */
function summarise(characters: readonly MockCharacter[]): string {
  const counts = new Map<HubId, number>();
  characters.forEach((c) => counts.set(c.hub, (counts.get(c.hub) ?? 0) + 1));
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([hub, n]) => `${n} on ${hubName(hub)}`)
    .join(', ');
}

function ApplyAll({ onApply }: { onApply: () => void }) {
  return (
    <Button size="sm" onClick={onApply}>
      Apply default to all
    </Button>
  );
}

function MarketDefaultsMock({
  variant,
  initial,
  openInitially,
}: {
  variant: Variant;
  initial: readonly MockCharacter[];
  openInitially: boolean;
}) {
  const [def, setDef] = useState<HubId>('jita');
  const [chars, setChars] = useState(initial);
  const [open, setOpen] = useState(openInitially);
  const single = chars.length === 1;
  const setOne = (id: number, hub: HubId) =>
    setChars((prev) => prev.map((c) => (c.characterId === id ? { ...c, hub } : c)));
  const applyAll = () => setChars((prev) => prev.map((c) => ({ ...c, hub: def })));
  const label = single ? 'Trade Hub' : 'Default Trade Hub for new characters';

  return (
    <Panel>
      <div className="space-y-4">
        <SettingsHint>Synced to every device you sign in on.</SettingsHint>
        <Fields variant="form">
          <Field
            label={label}
            htmlFor="settings-hub"
            note={
              single
                ? 'Prices and trades here unless a page picks its own.'
                : variant === 'B'
                  ? `Prices and trades at each character's own hub. ${summarise(chars)}.`
                  : 'Each character starts here. Pages that pick their own hub keep it.'
            }
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-56 flex-1 [&_button]:w-full">
                <HubSelect id="settings-hub" value={def} label={label} onChange={setDef} />
              </div>
              {variant === 'C' && !single && (
                <Button onClick={() => setOpen(true)}>Hub per character</Button>
              )}
            </div>
          </Field>
        </Fields>

        {variant === 'A' && !single && (
          <section aria-label="Per character" className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-widest text-text-dim uppercase">
                Per character
              </h3>
              <ApplyAll onApply={applyAll} />
            </div>
            <CharacterRows characters={chars} onChange={setOne} />
          </section>
        )}

        {variant === 'B' && !single && (
          <section aria-label="Per character">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls="per-character-hubs"
              onClick={() => setOpen(!open)}
            >
              {open ? 'Hide per character' : 'Set per character'}
            </Button>
            <Collapse open={open} id="per-character-hubs" className="pt-2">
              <div className="space-y-1">
                <CharacterRows characters={chars} onChange={setOne} />
                <div className="flex justify-end pt-1">
                  <ApplyAll onApply={applyAll} />
                </div>
              </div>
            </Collapse>
          </section>
        )}

        <p className="text-xs text-text-dim">
          Refining, courier collateral, contract flags, LP value and structure fees follow,
          unchanged.
        </p>
      </div>

      {variant === 'C' && (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Trade Hub per character"
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <ApplyAll onApply={applyAll} />
              <Button variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          }
        >
          <CharacterRows characters={chars} onChange={setOne} />
        </Modal>
      )}
    </Panel>
  );
}

/** Settings › Market defaults frame (header, rail on desktop) around one variant. */
export function TradeHubSettingsPage({
  variant,
  characters = FOUR,
  open = false,
}: {
  variant: Variant;
  characters?: readonly MockCharacter[];
  open?: boolean;
}) {
  return (
    <>
      <div className="mx-auto max-w-6xl space-y-4 p-4">
        <PageHeader title="Settings" />
        <div className="space-y-4 md:grid md:grid-cols-[11rem_minmax(0,1fr)] md:gap-6 md:space-y-0">
          <SettingsNav groups={visibleSettingsGroups({ corp: false })} value="market" />
          <div className="min-w-0 space-y-4">
            <MarketDefaultsMock variant={variant} initial={characters} openInitially={open} />
          </div>
        </div>
      </div>
    </>
  );
}
