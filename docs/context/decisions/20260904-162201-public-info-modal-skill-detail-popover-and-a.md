# Scope decisions (round 49) — Public Info Modal, Skill Detail popover, and a codebase-wide improvement pass

_Recorded 2026-09-04._

Following a page-by-page improvement audit, ~24 GitHub issues were opened
covering context-menu additions, cross-page links, performance, filters, and
UI/polish across every route. Two new shared components fell out of that
review and are recorded here so the tickets that consume them agree on shape
rather than each inventing its own:

- **Public Info Modal.** A tabbed, read-only modal showing another entity's
  public ESI info — Character (portrait, name, corp/alliance, security
  status), Corporation (name, ticker, member count, alliance), Alliance (name,
  ticker) — fed by the existing scope-free public endpoints
  (`/characters/{id}/`, `/corporations/{id}/`, `/alliances/{id}/`; no new
  scope, no consent-screen change). **Rule going forward: any action that
  today would "link to Contacts" or "link to /corp" to show what an entity
  is, where that entity is not guaranteed to already be a saved Contact or
  the user's own corp, opens this modal instead of navigating away.** Contacts
  itself opens it from a "Show Info" row action; Corp Members opens it in
  place of a Contacts link (a fellow corp member is not necessarily one of
  your Contacts); a contract's issuer likewise opens it rather than linking
  to Contacts. Employment History's link to the character's _own current_
  corp is unaffected — that's `/corp`, a real owned section, not a
  third-party lookup.
- **Skill Detail popover.** A small shared component (a modal or a rich
  tooltip — implementer's choice, not prescribed) showing one skill's
  description, unlocks, and prerequisite skills. Replaces two places that
  would otherwise navigate to a different route just to show read-only detail
  about a skill: Skills' own unlocks/prerequisites links, and Skill Plan
  Editor's skill-name links. Both should reuse the same component rather than
  building their own.
- **The Assets → Industry "view as material" context-menu action keys off
  `type_id`, not the row's per-stack `item_id`.** A Build Plan's materials
  list is matched by SDE type (a blueprint needs N units of _type_ X), not by
  a specific inventory item instance, so `item_id` would be the wrong key
  entirely — asked and settled during the audit review. (A "Copy Type ID"
  action alongside "Copy Name" was proposed for the same menu edit but
  dropped before implementation — issue #414 — as scope creep on a menu that
  already carries 7-9 entries app-wide.)
