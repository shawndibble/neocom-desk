const GUARDED = Symbol('translateGuard');

export function installTranslateGuard(): void {
  if ((Node.prototype.removeChild as unknown as Record<symbol, boolean>)[GUARDED]) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn('Skipped removeChild: node was moved (browser translation?)', child);
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };
  (Node.prototype.removeChild as unknown as Record<symbol, boolean>)[GUARDED] = true;

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn(
        'Skipped insertBefore: reference node was moved (browser translation?)',
        referenceNode
      );
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
