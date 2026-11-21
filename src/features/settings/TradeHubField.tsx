import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CharacterAvatar,
  Field,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import { Collapse } from '@/components/ui/Collapse';
import { useCharactersOrLoading } from '@/features/character/useCharacters';
import {
  hubCounts,
  resolveTradeHub,
  useHubByCharacter,
  type HubId,
} from '@/features/market/characterHubs';
import { pickGlobalHub, useDefaultMarketHub, useGlobalClosest } from '@/features/market/hub';
import { CLOSEST, type HubChoice } from '@/features/market/pageHubs';
import {
  applyDefaultHubToAll,
  changeDefaultHub,
  setOneCharacterHub,
} from '@/features/market/tradeHubActions';
import { TRADE_HUBS, getTradeHub } from '@/market/hubs';

/**
 * A field select over every Trade Hub, by name; shared by the Settings hub
 * controls. With `closest`, Closest hub is offered first (issue #6523).
 */
export function HubSelect<T extends HubChoice = HubId>({
  value,
  onChange,
  label,
  id,
  size,
  closest = false,
}: {
  value: T;
  onChange: (next: T) => void;
  label: string;
  id?: string;
  size?: 'md' | 'sm';
  closest?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={(next) => onChange(next as T)}>
      <SelectTrigger id={id} aria-label={label} size={size} className="max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {closest && <SelectItem value={CLOSEST}>{t('pageHubs.closest')}</SelectItem>}
        {TRADE_HUBS.map((hub) => (
          <SelectItem key={hub.id} value={hub.id}>
            {hub.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Settings › Market defaults › Trade Hub (issue #5593). One Character: plain
 * "Trade Hub". Several: the default for new characters, a one-line summary of
 * where everyone is, and a closed "Set per character" disclosure with a hub
 * select per character and "Apply default to all". Hubs are read from the
 * settled stores; the caller waits for both to hydrate.
 */
export function TradeHubField() {
  const { t } = useTranslation();
  const loaded = useCharactersOrLoading();
  const defaultHub = useDefaultMarketHub((state) => state.value);
  const map = useHubByCharacter((state) => state.value);
  const globalClosest = useGlobalClosest((state) => state.value);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  // Nothing until the roster has loaded: an empty one reads as "single" and would pin nobody.
  if (loaded === undefined) return null;
  const characters = loaded;
  const ids = characters.map((c) => c.characterId);
  const single = characters.length <= 1;

  const summary = hubCounts(map, ids, defaultHub)
    .map(([hub, count]) =>
      t('settings.tradeHubSummaryPart', { count, hub: getTradeHub(hub)?.systemName ?? hub })
    )
    .join(', ');
  const label = single ? t('settings.tradeHubSingleLabel') : t('settings.tradeHubLabel');
  const shown =
    single && ids[0] !== undefined ? resolveTradeHub(map, ids[0], defaultHub) : defaultHub;

  return (
    <Field
      label={label}
      htmlFor="settings-hub"
      note={single ? t('settings.tradeHubHint') : t('settings.tradeHubMultiNote', { summary })}
    >
      <div className="min-w-0 space-y-2">
        <HubSelect<HubChoice>
          id="settings-hub"
          closest
          value={globalClosest ? CLOSEST : shown}
          label={label}
          onChange={(choice) =>
            void (choice === CLOSEST
              ? pickGlobalHub(CLOSEST)
              : useGlobalClosest
                  .getState()
                  .setValue(false)
                  .then(() => changeDefaultHub(choice, ids)))
          }
        />
        {!single && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpen(!open)}
            >
              {open ? t('settings.tradeHubHidePerCharacter') : t('settings.tradeHubPerCharacter')}
            </Button>
            <Collapse open={open} id={panelId} className="pt-2">
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
                        value={resolveTradeHub(map, c.characterId, defaultHub)}
                        label={t('settings.tradeHubFor', { name: c.name })}
                        onChange={(hub) => void setOneCharacterHub(c.characterId, hub)}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end pt-1">
                <Button size="sm" onClick={() => void applyDefaultHubToAll(ids)}>
                  {t('settings.tradeHubApplyAll')}
                </Button>
              </div>
            </Collapse>
          </div>
        )}
      </div>
    </Field>
  );
}
