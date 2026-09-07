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

/** i18n key for `type`'s catalog name. Callers pass `humanizeEveType(type)` as the default value. */
export function eveTypeLabelKey(type: string): string {
  return `notifications.eveTypeName.${type}`;
}

/**
 * `StructureUnderAttack` → `Structure Under Attack`. Splits on the three
 * boundaries CCP's identifiers actually use — lower-to-upper, an acronym run
 * ending where a new word starts (`IHubBill` → `I Hub Bill`), and a trailing
 * number — then drops the `Msg` suffix a good third of the catalog carries,
 * which names nothing a reader needs. Never returns an empty string: a type
 * that is *only* the suffix keeps it.
 */
export function humanizeEveType(type: string): string {
  const spaced = type
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .trim();
  const withoutSuffix = spaced.replace(/ Msg$/, '');
  return withoutSuffix === '' ? spaced : withoutSuffix;
}
