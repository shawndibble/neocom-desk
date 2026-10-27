# Scope decisions — rail short default set ships as a flat N more pages row (issue #3266)

_Recorded 2026-10-09 · issue #3266._

- **The first-run answer is its own synced flag, `sync.navSetupAnswered`.** The hidden list stays `[]` by default and the answer writes the short rail; `[]` is a real value ("show everything"), so the list alone cannot say whether the pilot was asked. The flag syncs, so a second device does not ask again; answering writes the list and the flag together. Skipping or closing the question keeps the default set.
- **Activities map to extra pages on top of the default eight** (mining: Mining; PI: Planetary Industry; trading: Contracts; social: Mail, Calendar, Contacts; industry: none). Picking activities only ever adds pages.
- **"N more pages" counts hidden pages, not views, and replaces the foot's hidden-count button; Customize is the rail's edit mode, unchanged.**
