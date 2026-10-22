/**
 * Filet de sécurité : si une partie de l'interface plante pendant l'affichage,
 * on montre un message clair (avec l'erreur, utile pour corriger) au lieu d'une page blanche.
 * React impose une classe pour ce mécanisme (« error boundary »).
 *
 * Deux protections en plus :
 * - réparation automatique : une erreur isolée (ex. la carte qui se démonte pendant une animation
 *   quand on change de page) est ignorée une fois et l'affichage repart aussitôt ; le message
 *   n'apparaît que si l'erreur se répète dans les 10 secondes ;
 * - `resetKey` : quand il change (ex. l'adresse de la page), le message disparaît.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Une seule réparation automatique par période de 10 secondes. */
const RECOVERY_WINDOW_MS = 10_000;

interface Props {
  children: ReactNode;
  /** Texte affiché au-dessus de l'erreur (ex. « L'assistant a rencontré un problème »). */
  title?: string;
  /** Version compacte (pour un panneau) */
  compact?: boolean;
  /** Quand cette valeur change, l'erreur est oubliée (ex. changement de page). */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };
  private lastRecovery = 0;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erreur d'affichage :", error, info.componentStack);
    if (Date.now() - this.lastRecovery > RECOVERY_WINDOW_MS) {
      // Première erreur depuis un moment : on réessaie tout de suite, sans rien montrer
      this.lastRecovery = Date.now();
      this.setState({ error: null, componentStack: null });
    } else {
      this.setState({ componentStack: info.componentStack ?? null });
    }
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, componentStack: null });
    }
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    // Réparation automatique en cours : rien à afficher pendant cet instant
    if (Date.now() - this.lastRecovery > RECOVERY_WINDOW_MS) return null;
    // Les premiers composants de la pile indiquent où chercher (noms conservés à la compilation)
    const where = componentStack
      ?.split("\n")
      .map((line) => line.trim().replace(/^at /, "").split(" ")[0])
      .filter(Boolean)
      .slice(0, 4)
      .join(" ‹ ");
    return (
      <div className={this.props.compact ? "p-4" : "mx-auto max-w-lg p-6 pt-16"}>
        <div className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-5">
          <AlertTriangle className="size-6 text-rose-600" />
          <div>
            <p className="font-medium text-rose-900">{this.props.title ?? "Cette page a rencontré un problème d'affichage."}</p>
            <p className="mt-1 text-sm text-rose-800">
              Si la page est traduite automatiquement par le navigateur, désactivez la traduction puis rechargez.
            </p>
            <p className="mt-2 font-mono text-xs break-all text-rose-700">{error.message}</p>
            {where && <p className="mt-1 font-mono text-xs break-all text-rose-700/80">Composant : {where}</p>}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
            <Button size="sm" variant="outline" onClick={() => this.setState({ error: null, componentStack: null })}>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
