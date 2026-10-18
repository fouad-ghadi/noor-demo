/**
 * Filet de sécurité : si une partie de l'interface plante pendant l'affichage,
 * on montre un message clair (avec l'erreur, utile pour corriger) au lieu d'une page blanche.
 * React impose une classe pour ce mécanisme (« error boundary »).
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Texte affiché au-dessus de l'erreur (ex. « L'assistant a rencontré un problème »). */
  title?: string;
  /** Version compacte (pour un panneau) */
  compact?: boolean;
}

export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erreur d'affichage :", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
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
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
            <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
              Réessayer
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
