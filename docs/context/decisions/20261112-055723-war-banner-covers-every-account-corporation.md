# Scope decisions — War banner covers every account corporation (issue #6090)

_Recorded 2026-11-12 · issue #6090._

- **The War banner matches wars against every stored Character's corporation and alliance, not only the active Character's.** Widens `20261021-140400-war-banner-and-modal-read-an-open-wars.md`. A player splitting structures across many holding corporations must learn of a war on any of them without switching Characters. A war is listed once, tied to the first account corporation it is against (the active Character's first), so a shared alliance is not counted twice. With one corporation at war nothing changes; with several the strip counts corporations and the modal groups cards by corporation. Rules out a per-corporation war-eligibility view and any change to the published wars list.
