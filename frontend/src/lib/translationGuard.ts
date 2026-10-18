/**
 * Protection contre la traduction automatique du navigateur (Chrome, Brave, Edge...).
 *
 * Le traducteur remplace les textes de la page par ses propres éléments, sans prévenir React.
 * Quand React veut ensuite retirer ou insérer un texte qui n'est plus à sa place, le navigateur
 * lève une erreur (« Failed to execute 'removeChild' on 'Node' ») et toute la page devient blanche.
 * Ce correctif, recommandé dans le suivi des problèmes de React (issue n° 11538), ignore
 * simplement ces opérations devenues impossibles au lieu de faire planter l'application.
 */
export function installTranslationGuard() {
  if (typeof Node !== "function" || !Node.prototype) return;

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn("Traduction automatique : suppression ignorée d'un nœud déplacé.");
      return child;
    }
    return originalRemoveChild.call(this, child) as T;
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      console.warn("Traduction automatique : insertion ignorée avant un nœud déplacé.");
      return newNode;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}
