import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backTo?: string;
  backLabel?: string;
}

/** En-tête standard des pages : titre, sous-titre, actions à droite, lien retour. */
export function PageHeader({ title, description, actions, backTo, backLabel = "Retour" }: PageHeaderProps) {
  return (
    <div className="mb-6 lg:mb-8">
      {backTo && (
        <Link
          to={backTo}
          className="text-muted-foreground hover:text-foreground mb-2 inline-flex items-center gap-1 text-sm"
        >
          <ArrowLeft className="size-4" /> {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-ink text-[1.7rem] leading-tight font-semibold tracking-[-0.02em] text-balance lg:text-[2.1rem]">{title}</h1>
          {description && <div className="text-muted-foreground mt-1.5 text-[15px]">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}
