# Scope decisions — Blueprints use /bp icon render; SKINs have no image-server icon at all

_Recorded 2026-09-11._

- **`TypeIcon` (`src/components/ui/TypeIcon.tsx`) is now the one way to render a
  type's icon, and falls back `icon` → `bp` → a generic placeholder glyph.**
  `images.evetech.net/types/{id}/icon` 400s for every blueprint AND every
  reaction formula (verified: a manufacturing blueprint, a T2 blueprint, and a
  reaction formula all 400 on `/icon` and 200 on `/bp`) — those types only
  render under the `bp` variation, same type ID. SKINs (category 91, all 7
  groups: Permanent/1-Year/7-Day/30-Day/90-Day/180-Day/Volatile) 404 on
  `icon`, `render`, `bp`, AND `bpc` — they have no image on the server at all,
  in any variation, confirmed via ESI (`/universe/types/{id}` returns no
  `icon_id` field for a SKIN). That's an upstream CCP/SDE gap, not something a
  different endpoint fixes, so those permanently render the placeholder glyph
  (`Container`/Package icon) instead of the browser's broken-image icon. Rules
  out ever trying `/render` or `/bpc` as a further fallback for SKINs — this is
  already exhaustive. `TypeIcon` deliberately doesn't distinguish blueprint
  originals from copies (`/bpc`) since none of its call sites carry
  instance-level BPC state, only a type ID — it always uses `/bp`.
