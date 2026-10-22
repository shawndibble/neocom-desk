import { createContext } from 'react';

/**
 * True inside a `PageHeader`'s `scope` slot (not its `actions`: a context
 * there would reach through portals into any modal an action opens). A control with a size tier reads it and takes the
 * header's touch tier — 44px square below `md`, 36px tall from `md` up, the
 * `IconButton` default — whatever size the caller passed, so a picker or ⋮
 * there can't sit shorter than the icons beside it. `CharacterFilterControl`
 * reads it.
 */
export const PageHeaderClusterContext = createContext(false);
