/**
 * The human-readable name of one EVE Notification `type`.
 *
 * ESI names its notification types in CCP's own CamelCase — `CorpAllBillMsg`,
 * `StructureImpendingAbandonmentAssetsAtRisk` — and until now that identifier
 * reached the user twice: as the row label in Settings' per-type list, and
 * inside the generic notification body when a payload could not be rendered.
 * Neither is readable, and neither says what the type actually is.
 *
 * The catalog lives in i18n (`notifications.eveTypeName.<Type>`), one entry
 * per member of the Notification Allow-List, deliberately **not** reusing the
 * fired-notification titles: `StructureLostShields` and `StructureLostArmor`
 * share the title "Structure reinforced", and they are two separately
 * togglable rows in Settings.
 *
 * `humanizeEveType` is the floor under that catalog, not a replacement for
 * it — a spaced-out identifier still beats a run-on one for a type nothing
 * has written a name for yet. It only runs off the allow-list, which the
 * poller drops before delivery, so in practice nothing reaches it.
 */

/** i18n key for `type`'s catalog name. Exported for the invariant test; callers want `eveTypeLabel`. */
export function eveTypeLabelKey(type: string): string {
  return `notifications.eveTypeName.${type}`;
}

/**
 * Narrow enough for both translators that resolve these names: the reactive
 * `t` from `useTranslation` (so a label re-renders on a language change) and
 * the `i18n.t` singleton the synchronous renderer has to use.
 */
type TranslateWithDefault = (key: string, options: { defaultValue: string }) => string;

/**
 * The one way to resolve a type's name — catalog first, humanized identifier
 * as the floor. A function rather than a documented convention because the
 * two are only correct together: a caller that reached for the key alone
 * would ship `notifications.eveTypeName.CorpAllBillMsg` to a tray.
 */
export function eveTypeLabel(t: TranslateWithDefault, type: string): string {
  return t(eveTypeLabelKey(type), { defaultValue: humanizeEveType(type) });
}

/**
 * `StructureUnderAttack` → `Structure Under Attack`. Splits on the three
 * boundaries CCP's identifiers actually use — lower-to-upper, an acronym run
 * ending where a new word starts (`IHubBill` → `I Hub Bill`), and a trailing
 * number — then drops the `Msg` suffix a good third of the catalog carries,
 * which names nothing a reader needs. Dropping it can never empty the string:
 * the suffix is only stripped once it is a word of its own, which takes a
 * word in front of it.
 */
export function humanizeEveType(type: string): string {
  return type
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim()
    .replace(/ Msg$/, '');
}
