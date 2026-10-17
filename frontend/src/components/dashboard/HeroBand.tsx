/**
 * Bandeau vert pin en tête des tableaux de bord (même identité que la page de connexion).
 *
 *  Ordinateur :  [ titre + rythme du mois  |  contenu à droite (tournée du jour...) ]
 *  Téléphone  :  bandeau pleine largeur, collé sous la barre du haut, contenu empilé.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface Props {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Bloc sous le titre (ex. rythme du mois). */
  summary?: ReactNode;
  /** Colonne de droite sur ordinateur (ex. tournée du jour). */
  aside?: ReactNode;
  className?: string;
}

export function HeroBand({ title, subtitle, summary, aside, className }: Props) {
  return (
    <section
      className={cn(
        "bg-pine relative -mx-4 -mt-4 px-4 pt-6 pb-7 text-white sm:-mx-6 sm:px-6 lg:mx-0 lg:mt-0 lg:rounded-2xl lg:px-8 lg:py-8",
        aside && "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        <h1 className="font-display text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-balance lg:text-[2.1rem]">
          {title}
        </h1>
        {subtitle && <div className="mt-1.5 text-[15px] text-[#CFEDE7]">{subtitle}</div>}
        {summary && <div className="mt-6 lg:mt-auto lg:pt-8">{summary}</div>}
      </div>
      {aside && <div className="mt-7 min-w-0 border-t border-white/10 pt-6 lg:mt-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">{aside}</div>}
    </section>
  );
}

/** Rythme d'un objectif dans le bandeau : « 34 sur 62 visites », barre + repère, statut. */
export function HeroPace({
  caption,
  done,
  target,
  unit,
  progress,
  status,
  detail,
}: {
  caption: ReactNode;
  done: number;
  target: number;
  unit: string;
  progress: ReactNode;
  status?: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="max-w-sm">
      <p className="text-sm text-[#CFEDE7]">{caption}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="font-display tabular text-5xl font-semibold tracking-[-0.03em]">{done}</span>
        <span className="text-[15px] text-white/70">
          sur <span className="tabular">{target}</span> {unit}
        </span>
      </p>
      <div className="mt-3">{progress}</div>
      {(status || detail) && (
        <div className="mt-2.5 space-y-0.5 text-[13px]">
          {status}
          {detail && <p className="text-white/60">{detail}</p>}
        </div>
      )}
    </div>
  );
}
