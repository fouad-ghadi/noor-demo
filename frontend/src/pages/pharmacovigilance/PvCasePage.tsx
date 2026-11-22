/**
 * Un cas de pharmacovigilance : ce que dit le compte-rendu, les 4 informations minimales,
 * le délai de 24 h, et la DÉCLARATION PRÉ-REMPLIE à relire, compléter puis envoyer.
 *
 * « L'IA propose, le délégué valide » : NOOR n'envoie rien tout seul. Le délégué copie le texte
 * (ou l'ouvre dans sa messagerie), l'envoie, puis clique sur « Marquer comme déclarée ».
 */
import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ClipboardCopy, Mail, Send, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { PvCase } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { PvDeadlineBadge } from "@/components/pharmacovigilance/PvDeadlineBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { PV_KIND, PV_SITUATION } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function PvCasePage() {
  const id = Number(useParams().id);
  const query = useQuery({ queryKey: ["pv-case", id], queryFn: () => api.pvCase(id), enabled: !!id });
  usePageContext({ page: "pharmacovigilance", title: "Déclaration de pharmacovigilance", visitId: query.data?.visit_id });

  return (
    <>
      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && <CaseView c={query.data} />}
    </>
  );
}

function CaseView({ c }: { c: PvCase }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canDeclare = c.status === "a_declarer" && user?.id === c.delegue_id;

  // Compléments saisis par le délégué (pré-remplis avec ce que l'IA a trouvé)
  const [patient, setPatient] = useState(c.patient_details ?? "");
  const [info, setInfo] = useState("");
  const input = { patient_details: patient.trim() || null, additional_info: info.trim() || null };

  // Aperçu de la déclaration, recalculé par le backend 400 ms après la dernière frappe
  const [debounced, setDebounced] = useState(input);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced({ patient_details: patient.trim() || null, additional_info: info.trim() || null }), 400);
    return () => window.clearTimeout(t);
  }, [patient, info]);
  const preview = useQuery({
    queryKey: ["pv-preview", c.id, debounced],
    queryFn: () => api.pvPreview(c.id, debounced),
    enabled: canDeclare,
    placeholderData: keepPreviousData,
  });
  const draft = canDeclare ? (preview.data ?? c.declaration) : c.declaration;

  const declare = useMutation({
    mutationFn: () => api.pvDeclare(c.id, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(["pv-case", c.id], updated);
      for (const key of ["pv-cases", "alerts", "dashboard"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success("Cas marqué comme déclaré", { description: "L'alerte du tableau de bord est fermée." });
    },
    onError: (err: Error) => toast.error("Déclaration impossible", { description: err.message }),
  });

  const fullText = `À : ${draft.to}\nObjet : ${draft.subject}\n\n${draft.body}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      toast.success("Texte de la déclaration copié");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte à la main");
    }
  };
  const mailto = `mailto:${draft.to}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
  const patientInfo = c.minimum_info.find((i) => i.key === "patient");

  return (
    <>
      <PageHeader
        backTo="/pharmacovigilance"
        backLabel="Pharmacovigilance"
        title={`${PV_KIND[c.kind]}\u00a0: ${c.event}`}
        description={
          <>
            {c.product_name ? `${c.product_name}, ` : ""}
            <Link to={`/medecins/${c.doctor_id}`} className="hover:underline">{c.doctor_name}</Link>, visite du{" "}
            {formatDateTime(c.deadline.known_at)}
          </>
        }
        actions={<PvDeadlineBadge deadline={c.deadline} showDate className="text-sm" />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="grid content-start gap-6">
          {/* 1. Ce que dit le compte-rendu */}
          <Card>
            <CardHeader>
              <CardTitle>Ce que dit le compte-rendu</CardTitle>
              <CardDescription>Phrase repérée par l'IA dans les notes de la visite</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <blockquote className="border-pine text-ink border-l-2 pl-3 text-sm italic">« {c.excerpt} »</blockquote>
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Tag>{PV_KIND[c.kind]}</Tag>
                {c.situations.map((s) => (
                  <Tag key={s}>{PV_SITUATION[s]}</Tag>
                ))}
                <Tag className={c.seriousness === "grave" ? "border-rose-200 bg-rose-50 font-semibold text-rose-800" : ""}>
                  {c.seriousness === "grave" ? "Grave" : "Non grave"}
                </Tag>
              </div>
              <Link to={`/visites/${c.visit_id}/compte-rendu`} className="text-pine inline-block text-sm hover:underline">
                Ouvrir le compte-rendu
              </Link>
            </CardContent>
          </Card>

          {/* 2. Les 4 informations minimales */}
          <Card>
            <CardHeader>
              <CardTitle>Les 4 informations minimales</CardTitle>
              <CardDescription>
                {c.complete
                  ? "Tout est là : la déclaration est complète."
                  : c.declarable
                    ? "Déclarable dès maintenant (produit et effet présents). Complétez ce qui manque si possible."
                    : "Il manque le produit ou l'effet : demandez-les au médecin."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {c.minimum_info.map((i, n) => {
                  const found = i.key === "patient" ? i.found || !!patient.trim() : i.found;
                  return (
                    <li key={i.key} className="flex gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs",
                          found ? "bg-mint text-pine" : "bg-rose-50 text-rose-700",
                        )}
                        aria-label={found ? "Présente" : "Manquante"}
                      >
                        {found ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      </span>
                      <div className="min-w-0 text-sm">
                        <p className="text-ink font-medium">
                          {n + 1}. {i.label}
                        </p>
                        <p className={found ? "text-muted-foreground" : "text-rose-800"}>
                          {i.key === "patient" && canDeclare ? (patient.trim() || "Manquant") : (i.value ?? "Manquant")}
                        </p>
                        {i.hint && !(i.key === "patient" && found) && <p className="text-muted-foreground text-xs">{i.hint}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>

              {canDeclare && (
                <div className="border-line mt-5 space-y-4 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="pv-patient">Patient (âge, sexe ou initiales, jamais le nom)</Label>
                    <Input
                      id="pv-patient"
                      value={patient}
                      onChange={(e) => setPatient(e.target.value)}
                      placeholder="ex. homme, 45 ans, initiales A.B."
                      maxLength={200}
                      aria-invalid={!patientInfo?.found && !patient.trim() ? true : undefined}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pv-info">Informations complémentaires (facultatif)</Label>
                    <Textarea
                      id="pv-info"
                      value={info}
                      onChange={(e) => setInfo(e.target.value)}
                      placeholder="Évolution, traitement arrêté, examens demandés..."
                      maxLength={1000}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 3. La déclaration pré-remplie */}
        <Card className="content-start">
          <CardHeader>
            <CardTitle>{c.status === "declaree" ? "Déclaration envoyée" : "Déclaration pré-remplie"}</CardTitle>
            <CardDescription>
              {c.status === "declaree"
                ? `Déclarée le ${formatDateTime(c.declared_at!)}${c.declared_by_name ? ` par ${c.declared_by_name}` : ""}.`
                : "Relisez, envoyez-la par e-mail, puis marquez le cas comme déclaré."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">À</dt>
              <dd className="text-ink break-all">{draft.to}</dd>
              <dt className="text-muted-foreground">Objet</dt>
              <dd className="text-ink">{draft.subject}</dd>
            </dl>
            <pre
              className={cn(
                "border-line bg-paper text-ink max-h-[28rem] overflow-auto rounded-lg border p-3 font-sans text-[13px] leading-relaxed whitespace-pre-wrap",
                preview.isFetching && "opacity-70",
              )}
            >
              {draft.body}
            </pre>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={copy}>
                <ClipboardCopy /> Copier le texte
              </Button>
              {c.status === "a_declarer" && (
                <Button variant="outline" asChild>
                  <a href={mailto}>
                    <Mail /> Ouvrir dans la messagerie
                  </a>
                </Button>
              )}
              {canDeclare && (
                <Button onClick={() => declare.mutate()} disabled={!c.declarable || declare.isPending}>
                  <Send /> {declare.isPending ? "Enregistrement..." : "Marquer comme déclarée"}
                </Button>
              )}
            </div>
            {c.status === "a_declarer" && !canDeclare && (
              <p className="text-muted-foreground text-xs">Seul le délégué qui a recueilli l'information peut déclarer ce cas.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("border-line text-ink rounded-full border bg-white px-2 py-0.5", className)}>{children}</span>;
}
