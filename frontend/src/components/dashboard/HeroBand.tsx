/**
 * Bandeau vert pin en tête des tableaux de bord (même identité que la page de connexion).
 * Fond : dégradé + motif zellige « éclairé » (la lumière suit la souris sur ordinateur),
 * le grand chiffre compte jusqu'à sa valeur et la barre se remplit à l'arrivée.
 *
 *  Ordinateur :  [ titre + rythme du mois  |  contenu à droite (tournée du jour...) ]
 *  Téléphone  :  bandeau pleine largeur, collé sous la barre du haut, contenu empilé.
 */
import type { ReactNode } from "react";

import { ZelligeField } from "@/components/brand/ZelligeField";
import { AnimatedNumber } from "@/components/shared/AnimatedNumber";
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
        "bg-pine relative isolate -mx-4 overflow-hidden -mt-4 px-4 pt-6 pb-7 text-white sm:-mx-6 sm:px-6 lg:mx-0 lg:mt-0 lg:rounded-2xl lg:px-8 lg:py-8",
        aside && "lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10",
        className,
      )}
      style={{ background: "radial-gradient(110% 120% at 100% 0%, #175354 0%, var(--pine) 55%, #0B3031 100%)" }}
    >
      <ZelligeField className="-z-10" intensity={0.65} />
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
        <span className="font-display tabular text-5xl font-semibold tracking-[-0.03em] lg:text-6xl">
          <AnimatedNumber value={done} duration={1100} delay={250} />
        </span>
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
