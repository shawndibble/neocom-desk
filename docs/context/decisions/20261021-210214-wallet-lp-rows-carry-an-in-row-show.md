# Scope decisions — Wallet LP rows carry an in-row Show Info for the corporation (issue #4694)

_Recorded 2026-10-21 · issue #4694._

- **Each Wallet loyalty points row carries an ⓘ `IconButton` opening the
  corporation's Show Info, beside its name.** The row click still opens that
  corporation's LP Store, and the name is plain accent text (DESIGN §6c "A
  row's primary action beats name links inside it"). §6c's "Check first" rule
  would leave the ⓘ out, since the LP Store header already offers Show Info;
  Shawn kept it so a pilot can read a corporation's info without leaving the
  Wallet. It is an exception for this table only, not a precedent for adding
  ⓘ to other rows whose detail already carries Show Info.
- **Loyalty points follow the Wallet's character picker, summed per
  corporation; there is no Corporation scope.** ESI has no corporation LP
  endpoint. A picked Character whose grant lacks the loyalty scope gets a
  Grant banner naming them while the sum covers the rest.
