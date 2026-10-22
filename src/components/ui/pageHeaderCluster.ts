import { createContext } from 'react';

/**
 * True inside a `PageHeader`'s right-hand control cluster (its `scope` slot
 * and its `actions`). A control with a size tier reads it and takes the
 * header's touch tier — 44px square below `md`, 36px tall from `md` up, the
 * `IconButton` default — whatever size the caller passed, so a picker or ⋮
 * there can't sit shorter than the icons beside it. `CharacterFilterControl`
 * reads it.
 */
export const PageHeaderClusterContext = createContext(false);
