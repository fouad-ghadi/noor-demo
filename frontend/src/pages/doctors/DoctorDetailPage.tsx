/**
 * Fiche médecin : informations, statut de prescription par produit,
 * prochaine visite, réceptivité par créneau et historique complet des visites.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarClock,
  CalendarPlus,
  Clock,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  UserRound,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { api } from "@/api/client";
import type { DoctorDetail } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { PrescribingBadge, SegmentBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanVisitDialog } from "@/components/visits/PlanVisitDialog";
import { VisitHistory } from "@/components/visits/VisitHistory";
import { useProducts } from "@/hooks/queries";
import { formatDate, formatLongDay, formatTime } from "@/lib/format";
import { PRACTICE_TYPE, SEGMENT, SOURCE, TIME_SLOT } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function DoctorDetailPage() {
  const id = Number(useParams().id);
  const { isSupervisor } = useAuth();
  const [planOpen, setPlanOpen] = useState(false);
  const doctor = useQuery({ queryKey: ["doctor", id], queryFn: () => api.doctor(id) });

  const d = doctor.data;
  const name = d ? `Dr ${d.first_name} ${d.last_name}` : "Médecin";
  usePageContext({ page: "doctor_detail", title: name, doctorId: id });

  if (doctor.isLoading) return <LoadingState />;
  if (doctor.isError || !d) return <ErrorState error={doctor.error} onRetry={() => doctor.refetch()} />;

  const now = new Date();
  const history = d.visits.filter((v) => v.status !== "planifiee" || new Date(v.planned_at) < now);
  const upcoming = d.visits.filter((v) => v.status === "planifiee" && new Date(v.planned_at) >= now).reverse();

  return (
    <>
      <PageHeader
        backTo="/medecins"
        backLabel="Médecins"
        title={
          <span className="flex items-center gap-2.5">
            {name} <SegmentBadge segment={d.segment} />
          </span>
        }
        description={`${d.specialty} · ${PRACTICE_TYPE[d.practice_type]} · ${d.district}, ${d.city}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`/medecins/${d.id}/modifier`}>
                <Pencil /> Modifier
              </Link>
            </Button>
            {!isSupervisor && (
              <Button onClick={() => setPlanOpen(true)}>
                <CalendarPlus /> Planifier une visite
              </Button>
            )}
          </>
        }
      />

      {/* Chiffres clés */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <MiniStat label="Visites réalisées" value={String(d.visits_count)} />
        <MiniStat
          label="Dernière visite"
          value={d.days_since_last_visit === null ? "Jamais" : `il y a ${d.days_since_last_visit} j`}
          tone={d.days_since_last_visit === null || d.days_since_last_visit > 30 ? "warning" : "default"}
        />
        <MiniStat
          label="Prochaine visite"
          value={d.next_visit ? formatDate(d.next_visit.planned_at) : "—"}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Colonne gauche : infos */}
        <div className="space-y-5">
          <InfoCard doctor={d} />
          <ReceptivityCard doctor={d} />
        </div>

        {/* Colonne droite : prochaine visite, prescriptions, historique */}
        <div className="space-y-5 lg:col-span-2">
          {upcoming.length > 0 && (
            <Card className="border-teal-200 bg-teal-50/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="size-4 text-teal-700" /> Visites planifiées
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcoming.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                    <span className="first-letter:uppercase">
                      {formatLongDay(v.planned_at)} à <strong>{formatTime(v.planned_at)}</strong>
                    </span>
                    {v.notes && <span className="text-muted-foreground hidden truncate pl-3 text-xs sm:block">{v.notes}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <PrescriptionsCard doctor={d} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> Historique des visites
              </CardTitle>
              <CardDescription>{history.length} visite(s), de la plus récente à la plus ancienne</CardDescription>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <EmptyState title="Aucune visite pour l'instant" />
              ) : (
                <VisitHistory visits={history} readOnly={isSupervisor} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <PlanVisitDialog
        open={planOpen}
        onOpenChange={setPlanOpen}
        doctor={{ id: d.id, name, preferred_slot: d.preferred_slot }}
      />
    </>
  );
}

function MiniStat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <Card className="gap-1 px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={cn("tabular text-base font-semibold lg:text-lg", tone === "warning" && "text-amber-600")}>{value}</p>
    </Card>
  );
}

function InfoRow({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function InfoCard({ doctor: d }: { doctor: DoctorDetail }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Coordonnées</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <InfoRow icon={MapPin}>
          <p>{d.address}</p>
          <p className="text-muted-foreground">
            {d.district}, {d.city}
          </p>
        </InfoRow>
        <InfoRow icon={Phone}>
          {d.phone ? (
            <a className="text-teal-700 hover:underline" href={`tel:${d.phone.replace(/[^\d+]/g, "")}`}>
              {d.phone}
            </a>
          ) : (
            <span className="text-muted-foreground">Non renseigné</span>
          )}
        </InfoRow>
        <InfoRow icon={Mail}>
          {d.email ? (
            <a className="break-all text-teal-700 hover:underline" href={`mailto:${d.email}`}>
              {d.email}
            </a>
          ) : (
            <span className="text-muted-foreground">Non renseigné</span>
          )}
        </InfoRow>
        <InfoRow icon={Building2}>{PRACTICE_TYPE[d.practice_type]}</InfoRow>
        <InfoRow icon={Clock}>
          Créneau préféré : {d.preferred_slot ? TIME_SLOT[d.preferred_slot] : "non renseigné"}
        </InfoRow>
        <InfoRow icon={UserRound}>
          <p>Délégué : {d.delegue_name}</p>
          <p className="text-muted-foreground text-xs">
            {SEGMENT[d.segment].label} · Fiche créée le {formatDate(d.created_at)} ({SOURCE[d.source]})
          </p>
        </InfoRow>
        {d.notes && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">📝 {d.notes}</p>}
      </CardContent>
    </Card>
  );
}

/** Réceptivité selon le créneau : part des visites avec un retour favorable. */
function ReceptivityCard({ doctor: d }: { doctor: DoctorDetail }) {
  const withVisits = d.slot_stats.filter((s) => s.visits > 0);
  const best = [...withVisits].sort((a, b) => b.favorable_rate - a.favorable_rate)[0];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Réceptivité par créneau</CardTitle>
        <CardDescription>% de visites avec un retour favorable</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {withVisits.length === 0 && <p className="text-muted-foreground text-sm">Pas encore assez de visites.</p>}
        {d.slot_stats.map((s) => (
          <div key={s.slot} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className={cn(best?.slot === s.slot && "font-semibold text-teal-800")}>
                {TIME_SLOT[s.slot]} {best?.slot === s.slot && "⭐"}
              </span>
              <span className="text-muted-foreground tabular">
                {s.visits ? `${Math.round(s.favorable_rate)} % · ${s.visits} visite(s)` : "—"}
              </span>
            </div>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className={cn("h-full rounded-full", best?.slot === s.slot ? "bg-teal-600" : "bg-teal-300")}
                style={{ width: `${s.favorable_rate}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PrescriptionsCard({ doctor: d }: { doctor: DoctorDetail }) {
  const products = useProducts();
  // Produits ciblant la spécialité du médecin en premier
  const targeted = new Set(
    (products.data ?? []).filter((p) => p.target_specialties.includes(d.specialty)).map((p) => p.id),
  );
  const sorted = [...d.prescriptions].sort((a, b) => Number(targeted.has(b.product_id)) - Number(targeted.has(a.product_id)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Statut de prescription par produit</CardTitle>
        <CardDescription>Les produits ciblant la spécialité « {d.specialty} » apparaissent en premier.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {sorted.map((p) => (
          <Link
            to={`/produits/${p.product_id}`}
            key={p.product_id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 transition hover:border-teal-300",
              !targeted.has(p.product_id) && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.brand_name}</p>
              <p className="text-muted-foreground truncate text-xs">{p.molecule}</p>
            </div>
            <PrescribingBadge status={p.status} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
