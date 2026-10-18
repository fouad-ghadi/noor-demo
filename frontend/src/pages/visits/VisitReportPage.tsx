/**
 * Compte-rendu de visite (/visites/:id/compte-rendu).
 *
 * Le délégué remplit : produits présentés, durée, accueil du médecin, objections,
 * échantillons, notes, suite à donner et prochaine visite.
 * La validation passe la visite en « réalisée » → les KPIs du tableau de bord se mettent à jour.
 *
 * Pensé pour le téléphone : gros boutons, sélection par « puces », bouton de validation fixe en bas.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { Check, CheckCircle2, Lightbulb, Loader2, Minus, Plus } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { VoiceReportResult } from "@/api/ai";
import type { Feedback, Product, Visit } from "@/api/types";
import { AiFeatureButton } from "@/components/ai/AiFeatureButton";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { SegmentBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TIME_OPTIONS } from "@/components/visits/PlanVisitDialog";
import { VoiceDictationDialog } from "@/components/visits/VoiceDictationDialog";
import { invalidateVisitData, useMeta, useProducts } from "@/hooks/queries";
import { formatDate, formatLongDay, formatTime, toApiDateTime } from "@/lib/format";
import { FEEDBACK } from "@/lib/labels";
import { cn } from "@/lib/utils";

const DURATIONS = [5, 10, 15, 20, 30];
/** Délai conseillé avant la prochaine visite, selon le segment du médecin. */
const NEXT_VISIT_DAYS = { A: 14, B: 30, C: 60 } as const;
const NEXT_STEP_SUGGESTIONS = [
  "Apporter des échantillons",
  "Remettre l'étude clinique",
  "Inviter à la soirée scientifique",
  "Faire le point sur les retours patients",
];
const NONE = "__aucun__";

/** Bouton « puce » sélectionnable (produits, objections, durée...). */
function Chip({ selected, onClick, children, className }: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "border-input inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition",
        selected ? "border-pine bg-pine text-white" : "bg-white hover:border-pine/30 hover:bg-mint-wash",
        className,
      )}
    >
      {selected && <Check className="size-3.5" />}
      {children}
    </button>
  );
}

/**
 * Étape numérotée du compte-rendu.
 * Sur ordinateur, les étapes sont reliées par un rail vertical (comme le trajet de la tournée) ;
 * sur téléphone, le numéro passe dans le titre pour garder toute la largeur.
 */
function Section({ n, title, description, children }: { n: number; title: string; description?: string; children: React.ReactNode }) {
  const number = (
    <span className="bg-pine text-mint font-display flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">{n}</span>
  );
  return (
    <section className="group/step relative sm:grid sm:grid-cols-[2rem_minmax(0,1fr)] sm:gap-x-4">
      <div className="relative hidden justify-center sm:flex" aria-hidden="true">
        <span className="relative z-10 mt-4">{number}</span>
        {/* Rail jusqu'à l'étape suivante (absent après la dernière) */}
        <span className="bg-line absolute top-12 -bottom-4 w-0.5 group-last-of-type/step:hidden" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5">
            <span className="sm:hidden">{number}</span>
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  );
}

/** Libellés des champs que la dictée n'a pas pu remplir avec certitude. */
const UNCERTAIN_LABEL: Record<string, string> = {
  product_ids: "produits présentés",
  feedback: "accueil du médecin",
  duration_min: "durée de l'entretien",
  objections: "objections",
  samples: "échantillons",
  next_step: "suite à donner",
};

export function VisitReportPage() {
  const id = Number(useParams().id);
  const visit = useQuery({ queryKey: ["visit", id], queryFn: () => api.visit(id) });
  const products = useProducts();
  const meta = useMeta();

  usePageContext({
    page: "visit_report",
    title: visit.data ? `Compte-rendu — ${visit.data.doctor_name}` : "Compte-rendu de visite",
    visitId: id,
    doctorId: visit.data?.doctor_id,
  });

  if (visit.isLoading || products.isLoading || meta.isLoading) return <LoadingState />;
  if (visit.isError || !visit.data) return <ErrorState error={visit.error} onRetry={() => visit.refetch()} />;

  const v = visit.data;
  if (v.status === "annulee" || v.status === "reportee") {
    return (
      <>
        <PageHeader backTo="/planning" backLabel="Planning" title="Compte-rendu de visite" />
        <ErrorState error={new Error(`Cette visite a été ${v.status === "annulee" ? "annulée" : "reportée"} : pas de compte-rendu possible.`)} />
      </>
    );
  }
  return (
    <ReportForm
      visit={v}
      products={products.data ?? []}
      objectionCategories={meta.data?.objection_categories ?? {}}
    />
  );
}

function ReportForm({ visit, products, objectionCategories }: {
  visit: Visit;
  products: Product[];
  objectionCategories: Record<string, string>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = visit.status === "realisee";

  // Produits ciblant la spécialité du médecin d'abord
  const [targeted, others] = useMemo(() => {
    const t = products.filter((p) => p.target_specialties.includes(visit.doctor_specialty));
    return [t, products.filter((p) => !t.includes(p))];
  }, [products, visit.doctor_specialty]);
  const [showOthers, setShowOthers] = useState(false);

  // --- État du formulaire -------------------------------------------------
  const start = parseISO(visit.actual_at ?? visit.planned_at);
  const [date, setDate] = useState(format(start, "yyyy-MM-dd"));
  const [time, setTime] = useState(TIME_OPTIONS.includes(format(start, "HH:mm")) ? format(start, "HH:mm") : format(start, "HH:00"));
  const [duration, setDuration] = useState<number>(visit.duration_min ?? 15);
  const [productIds, setProductIds] = useState<number[]>(visit.products.map((p) => p.product_id));
  const [feedback, setFeedback] = useState<Feedback | null>(visit.feedback);
  const [objections, setObjections] = useState<Record<string, { comment: string; product_id: number | null }>>(
    Object.fromEntries(visit.objections.map((o) => [o.category, { comment: o.comment ?? "", product_id: o.product_id }])),
  );
  const [samples, setSamples] = useState<Record<number, number>>(
    Object.fromEntries(visit.samples.map((s) => [s.product_id, s.quantity])),
  );
  const [notes, setNotes] = useState(visit.notes ?? "");
  const [nextStep, setNextStep] = useState(visit.next_step ?? "");
  const [nextDate, setNextDate] = useState(
    visit.next_visit_date ?? format(addDays(start, NEXT_VISIT_DAYS[visit.doctor_segment]), "yyyy-MM-dd"),
  );
  const [planNext, setPlanNext] = useState(!isEdit);
  // IA (dictée) : source du compte-rendu et champs à vérifier en priorité
  const [reportSource, setReportSource] = useState<"manuel" | "dictee">(visit.report_source === "dictee" ? "dictee" : "manuel");
  const [toCheck, setToCheck] = useState<string[] | null>(null);
  const [dictationOpen, setDictationOpen] = useState(false);

  /** Pré-remplit le formulaire avec le brouillon produit par la dictée (le délégué relit ensuite). */
  const applyDraft = ({ draft, uncertain_fields }: VoiceReportResult) => {
    setDuration(draft.duration_min);
    setProductIds(draft.product_ids);
    setFeedback(draft.feedback as Feedback);
    setObjections(
      Object.fromEntries(draft.objections.map((o) => [o.category, { comment: o.comment ?? "", product_id: o.product_id ?? null }])),
    );
    setSamples(Object.fromEntries(draft.samples.map((x) => [x.product_id, x.quantity])));
    setNotes(draft.notes ?? "");
    if (draft.next_step) setNextStep(draft.next_step);
    if (draft.next_visit_date) setNextDate(draft.next_visit_date);
    if (draft.product_ids.some((pid) => !targeted.some((p) => p.id === pid))) setShowOthers(true);
    setReportSource("dictee");
    setToCheck(uncertain_fields);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Formulaire pré-rempli par la dictée", { description: "Relisez-le avant de valider." });
  };

  // Une visite est-elle déjà planifiée pour ce médecin ? (alors pas de création automatique)
  const upcoming = useQuery({
    queryKey: ["visits", { doctor_id: visit.doctor_id, status: "planifiee", start: "now" }],
    queryFn: () => api.visits({ doctor_id: visit.doctor_id, status: "planifiee", start: toApiDateTime(new Date()) }),
  });
  const alreadyPlanned = upcoming.data?.find((u) => u.id !== visit.id);

  // Ouverture du formulaire : on remonte en haut de la page
  useEffect(() => window.scrollTo(0, 0), [visit.id]);

  const toggleProduct = (pid: number) =>
    setProductIds((ids) => (ids.includes(pid) ? ids.filter((x) => x !== pid) : [...ids, pid]));
  const toggleObjection = (cat: string) =>
    setObjections((o) => {
      const next = { ...o };
      if (next[cat]) delete next[cat];
      else next[cat] = { comment: "", product_id: productIds.length === 1 ? productIds[0] : null };
      return next;
    });
  const setSample = (pid: number, qty: number) => setSamples((s) => ({ ...s, [pid]: Math.max(0, Math.min(50, qty)) }));

  const presented = products.filter((p) => productIds.includes(p.id));

  const mutation = useMutation({
    mutationFn: () =>
      api.submitReport(visit.id, {
        actual_at: `${date}T${time}:00`,
        duration_min: duration,
        product_ids: productIds,
        feedback: feedback!,
        objections: Object.entries(objections).map(([category, o]) => ({
          category,
          comment: o.comment.trim() || null,
          product_id: o.product_id,
        })),
        samples: Object.entries(samples)
          .filter(([pid, q]) => q > 0 && productIds.includes(Number(pid)))
          .map(([pid, quantity]) => ({ product_id: Number(pid), quantity })),
        notes: notes.trim() || null,
        next_step: nextStep.trim() || null,
        next_visit_date: nextDate || null,
        plan_next_visit: planNext && !alreadyPlanned,
        report_source: reportSource,
      }),
    onSuccess: () => {
      invalidateVisitData(queryClient);
      toast.success(isEdit ? "Compte-rendu mis à jour" : "Compte-rendu enregistré", {
        description: isEdit
          ? visit.doctor_name
          : `${visit.doctor_name} — visite réalisée${planNext && !alreadyPlanned && nextDate ? `, prochaine visite le ${formatDate(nextDate)}` : ""}`,
      });
      // Retour à l'écran précédent (planning, tableau de bord ou fiche médecin)
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else navigate("/planning");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (productIds.length === 0) return toast.error("Sélectionnez au moins un produit présenté");
    if (!feedback) return toast.error("Indiquez l'accueil du médecin");
    mutation.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        backTo="/planning"
        backLabel="Planning"
        title={isEdit ? "Modifier le compte-rendu" : "Compte-rendu de visite"}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <SegmentBadge segment={visit.doctor_segment} className="size-5 text-[11px]" />
            <Link to={`/medecins/${visit.doctor_id}`} className="text-ink font-medium underline-offset-4 hover:underline">
              {visit.doctor_name}
            </Link>
            <span>
              {visit.doctor_specialty}, {visit.doctor_district}. Prévue {formatLongDay(visit.planned_at)} à {formatTime(visit.planned_at)}
            </span>
          </span>
        }
      />

      <form onSubmit={submit} className="space-y-4 pb-4">
        {/* IA : dictée vocale (backend/app/ai/voice_report.py) → formulaire pré-rempli, relu par le délégué */}
        <div className="bg-pine flex flex-col gap-3 rounded-xl p-4 text-white sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <p className="text-[15px] text-[#CFEDE7]">
            Pressé ? Dictez votre compte-rendu, en darija ou en français : NOOR remplira le formulaire.
          </p>
          <AiFeatureButton
            icon="🎤"
            label="Dicter le compte-rendu"
            description="Dictez la visite en darija ou en français ; le formulaire sera pré-rempli et vous n'aurez plus qu'à le relire."
            className="shrink-0"
            enabled
            onClick={() => setDictationOpen(true)}
          />
        </div>

        {/* Après la dictée : rappel de relire, et champs dont NOOR n'est pas sûr */}
        {toCheck && (
          <div className="border-mint bg-mint-wash/60 text-ink rounded-xl border px-4 py-3 text-sm">
            <p className="font-medium">Formulaire pré-rempli par la dictée : relisez chaque étape avant de valider.</p>
            {toCheck.length > 0 && (
              <p className="text-ink/75 mt-0.5">
                Non précisé dans la dictée, à compléter : {toCheck.map((f) => UNCERTAIN_LABEL[f] ?? f).join(", ")}.
              </p>
            )}
          </div>
        )}

        <Section n={1} title="Visite">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-[1fr_1fr_2fr]">
            <div className="space-y-2">
              <Label htmlFor="report-date">Date</Label>
              <Input id="report-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Heure</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2 sm:col-span-1">
              <Label>Durée de l'entretien</Label>
              <div className="flex flex-wrap gap-1.5">
                {DURATIONS.map((d) => (
                  <Chip key={d} selected={duration === d} onClick={() => setDuration(d)} className="px-2.5">
                    {d} min
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section n={2} title="Produits présentés" description={`Produits conseillés pour la spécialité « ${visit.doctor_specialty} » en premier.`}>
          <div className="flex flex-wrap gap-2">
            {targeted.map((p) => (
              <Chip key={p.id} selected={productIds.includes(p.id)} onClick={() => toggleProduct(p.id)}>
                {p.brand_name}
              </Chip>
            ))}
            {(showOthers ? others : others.filter((p) => productIds.includes(p.id))).map((p) => (
              <Chip key={p.id} selected={productIds.includes(p.id)} onClick={() => toggleProduct(p.id)}>
                {p.brand_name}
              </Chip>
            ))}
            {!showOthers && others.length > 0 && (
              <Button type="button" variant="link" size="sm" onClick={() => setShowOthers(true)}>
                + Autres produits
              </Button>
            )}
          </div>
          {/* Rappel des messages clés des produits sélectionnés */}
          {presented.length > 0 && (
            <div className="mt-4 space-y-2 rounded-lg bg-mint-wash/70 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Lightbulb className="size-3.5" /> Messages clés à passer
              </p>
              {presented.map((p) => (
                <div key={p.id} className="text-xs text-ink">
                  <span className="font-semibold">{p.brand_name} :</span> {p.key_messages.slice(0, 2).join(" ; ")}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section n={3} title="Accueil du médecin">
          <div className="grid grid-cols-5 gap-2">
            {(Object.keys(FEEDBACK) as Feedback[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFeedback(f)}
                aria-pressed={feedback === f}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 text-center transition",
                  feedback === f ? "border-pine bg-mint-wash ring-pine/15 ring-2" : "border-line bg-white hover:bg-mint-wash/50",
                )}
              >
                <span className="text-2xl">{FEEDBACK[f].emoji}</span>
                <span className="text-[11px] leading-tight font-medium">{FEEDBACK[f].label}</span>
              </button>
            ))}
          </div>
        </Section>

        <Section n={4} title="Objections" description="Sélectionnez les objections soulevées, puis précisez si besoin.">
          <div className="flex flex-wrap gap-2">
            {Object.entries(objectionCategories).map(([cat, label]) => (
              <Chip key={cat} selected={!!objections[cat]} onClick={() => toggleObjection(cat)}>
                {label}
              </Chip>
            ))}
          </div>
          {Object.keys(objections).length > 0 && (
            <div className="mt-4 space-y-3">
              {Object.entries(objections).map(([cat, o]) => (
                <div key={cat} className="space-y-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">{objectionCategories[cat]}</p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_12rem]">
                    <Input
                      placeholder="Ce qu'a dit le médecin (facultatif)"
                      value={o.comment}
                      onChange={(e) => setObjections((all) => ({ ...all, [cat]: { ...o, comment: e.target.value } }))}
                    />
                    <Select
                      value={o.product_id ? String(o.product_id) : NONE}
                      onValueChange={(val) =>
                        setObjections((all) => ({ ...all, [cat]: { ...o, product_id: val === NONE ? null : Number(val) } }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Tous produits</SelectItem>
                        {presented.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {p.brand_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section n={5} title="Échantillons remis">
          {presented.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sélectionnez d'abord les produits présentés.</p>
          ) : (
            <div className="space-y-2">
              {presented.map((p) => {
                const qty = samples[p.id] ?? 0;
                return (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="text-sm font-medium">{p.brand_name}</span>
                    <div className="flex items-center gap-2">
                      <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => setSample(p.id, qty - 1)} aria-label="Moins">
                        <Minus />
                      </Button>
                      <span className="tabular w-8 text-center font-semibold">{qty}</span>
                      <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => setSample(p.id, qty + 1)} aria-label="Plus">
                        <Plus />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section n={6} title="Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Ce qui s'est dit, l'intérêt du médecin, ses retours patients, toute information utile…"
          />
          <p className="text-muted-foreground mt-2 text-xs">
            ⚠️ Si le médecin mentionne un effet indésirable chez un patient, notez-le ici : il devra être déclaré à la pharmacovigilance.
          </p>
        </Section>

        <Section n={7} title="Suite à donner">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="next-step">Prochaine action</Label>
              <Input id="next-step" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Ex. apporter l'étude comparative" />
              <div className="flex flex-wrap gap-1.5">
                {NEXT_STEP_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setNextStep(s)}
                    className="text-muted-foreground hover:bg-muted cursor-pointer rounded-full border border-dashed px-2.5 py-1 text-xs"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="next-date">Prochaine visite</Label>
                <Input id="next-date" type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} />
                <p className="text-muted-foreground text-xs">
                  Conseillé : tous les {NEXT_VISIT_DAYS[visit.doctor_segment]} jours pour un médecin de segment {visit.doctor_segment}.
                </p>
              </div>
              {!isEdit && alreadyPlanned && (
                <p className="rounded-lg border border-mint bg-mint-wash p-3 text-sm text-ink">
                  Une visite est déjà planifiée le <strong>{formatDate(alreadyPlanned.planned_at)}</strong> à{" "}
                  {formatTime(alreadyPlanned.planned_at)} : pas de nouvelle visite créée.
                </p>
              )}
              {!isEdit && !alreadyPlanned && (
                <label className="border-line flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm">
                  <Checkbox checked={planNext} onCheckedChange={(c) => setPlanNext(c === true)} className="mt-0.5" />
                  <span>
                    Planifier automatiquement cette visite
                    <span className="text-muted-foreground block text-xs">Elle apparaîtra dans votre planning.</span>
                  </span>
                </label>
              )}
            </div>
          </div>
        </Section>

        {/* Barre de validation fixe (au-dessus de la navigation mobile) */}
        <div className="border-line shadow-pine/10 sticky bottom-20 z-10 flex items-center justify-between gap-3 rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur lg:bottom-4">
          <p className="text-muted-foreground hidden text-[13px] sm:block">
            {productIds.length} produit(s) présenté(s), accueil : {feedback ? FEEDBACK[feedback].label.toLowerCase() : "non renseigné"}
          </p>
          <div className="flex flex-1 justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {isEdit ? "Enregistrer" : "Valider la visite"}
            </Button>
          </div>
        </div>
      </form>
      <VoiceDictationDialog open={dictationOpen} onOpenChange={setDictationOpen} visitId={visit.id} onDraft={applyDraft} />
    </div>
  );
}
