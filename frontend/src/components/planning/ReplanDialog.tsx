/**
 * ⚡ IA — « Imprévu ? Réorganiser ma journée » (backend : week_planner.replan_day).
 *
 * Le délégué indique ce qui se passe :
 *   - un retard (embouteillage, attente chez un médecin) : la suite est décalée, ce qui ne tient plus est reporté ;
 *   - un médecin absent : ses visites sont reportées au prochain jour où il reçoit ;
 *   - une journée interrompue (urgence, panne, maladie) : tout le reste est reporté, médecin par médecin.
 * NOOR propose les déplacements, chacun avec son pourquoi. Le délégué décoche ce qu'il ne veut pas, puis valide.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, CalendarClock, Clock, Loader2, UserX, Zap } from "lucide-react";
import { toast } from "sonner";

import { aiApi, type ReplanProposal, type ReplanReason } from "@/api/ai";
import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { invalidateVisitData } from "@/hooks/queries";
import { formatLongDay, formatTime, toApiDate, toApiDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const REASONS: { value: ReplanReason; label: string; hint: string; icon: typeof Clock }[] = [
  { value: "retard", label: "Je suis en retard", hint: "La suite de la journée est décalée", icon: Clock },
  { value: "medecin_absent", label: "Un médecin est absent", hint: "Sa visite est reportée", icon: UserX },
  { value: "journee_interrompue", label: "Je dois arrêter ma journée", hint: "Urgence, panne, maladie…", icon: Zap },
];
const DELAYS = [15, 30, 45, 60, 90, 120];

export function ReplanDialog({ open, onOpenChange, day }: { open: boolean; onOpenChange: (o: boolean) => void; day?: Date }) {
  const queryClient = useQueryClient();
  const target = day ?? new Date();
  const dayKey = toApiDate(target);
  const [reason, setReason] = useState<ReplanReason>("retard");
  const [delay, setDelay] = useState(30);
  const [absent, setAbsent] = useState<number[]>([]);
  const [proposal, setProposal] = useState<ReplanProposal | null>(null);
  const [dropped, setDropped] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setProposal(null);
      setAbsent([]);
      setDropped(new Set());
    }
  }, [open]);

  // Visites encore planifiées ce jour-là (pour choisir le médecin absent)
  const visits = useQuery({
    queryKey: ["visits", { replan: dayKey }],
    queryFn: () =>
      api.visits({ start: `${dayKey}T00:00:00`, end: toApiDateTime(new Date(target.getFullYear(), target.getMonth(), target.getDate() + 1)), status: "planifiee" }),
    enabled: open,
  });
  const planned = (visits.data ?? []).filter((v) => !v.report_pending);

  const propose = useMutation({
    mutationFn: () => aiApi.replanDay({ day: dayKey, reason, delay_min: reason === "retard" ? delay : 0, visit_ids: absent }),
    onSuccess: (p) => {
      setProposal(p);
      setDropped(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const apply = useMutation({
    mutationFn: () =>
      aiApi.applyReplan(proposal!.moves.filter((m) => !dropped.has(m.visit_id)).map((m) => ({ visit_id: m.visit_id, planned_at: m.new_at }))),
    onSuccess: (r) => {
      invalidateVisitData(queryClient);
      toast.success(`${r.moved} visite${r.moved > 1 ? "s" : ""} déplacée${r.moved > 1 ? "s" : ""}`, { description: "Votre planning est à jour." });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kept = proposal ? proposal.moves.filter((m) => !dropped.has(m.visit_id)).length : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-xl">
            <CalendarClock className="text-pine size-5" /> Imprévu : réorganiser ma journée
          </DialogTitle>
          <DialogDescription className="first-letter:uppercase">
            {formatLongDay(target)}. NOOR propose une nouvelle organisation, vous validez.
          </DialogDescription>
        </DialogHeader>

        {!proposal && (
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Que se passe-t-il ?">
              {REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  role="radio"
                  aria-checked={reason === r.value}
                  onClick={() => setReason(r.value)}
                  className={cn(
                    "border-line flex cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors",
                    reason === r.value ? "border-pine bg-mint-wash" : "hover:bg-mint-wash/50 bg-white",
                  )}
                >
                  <r.icon className="text-pine size-4" />
                  <span className="text-ink text-sm font-medium">{r.label}</span>
                  <span className="text-muted-foreground text-xs">{r.hint}</span>
                </button>
              ))}
            </div>

            {reason === "retard" && (
              <div className="space-y-2">
                <Label>Retard estimé</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DELAYS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={delay === d}
                      onClick={() => setDelay(d)}
                      className={cn(
                        "cursor-pointer rounded-full border px-3 py-1.5 text-sm",
                        delay === d ? "border-pine bg-pine text-white" : "border-line hover:bg-mint-wash bg-white",
                      )}
                    >
                      {d < 60 ? `${d} min` : `${Math.floor(d / 60)} h${d % 60 ? ` ${d % 60}` : ""}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {reason === "medecin_absent" && (
              <div className="space-y-2">
                <Label>Quelle visite ?</Label>
                {planned.length === 0 && <p className="text-muted-foreground text-sm">Aucune visite encore prévue ce jour-là.</p>}
                <ul className="space-y-1.5">
                  {planned.map((v) => (
                    <li key={v.id}>
                      <label className="border-line flex cursor-pointer items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
                        <Checkbox
                          checked={absent.includes(v.id)}
                          onCheckedChange={(c) => setAbsent((a) => (c === true ? [...a, v.id] : a.filter((x) => x !== v.id)))}
                        />
                        <span className="tabular w-11 font-medium">{formatTime(v.planned_at)}</span>
                        <span className="text-ink flex-1">{v.doctor_name}</span>
                        <span className="text-muted-foreground text-xs">{v.doctor_district}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {proposal && (
          <div className="space-y-3">
            <p className="border-line bg-mint-wash/50 text-ink rounded-lg border px-3 py-2 text-sm">
              <span className="font-medium">{proposal.reason_label}.</span> {proposal.summary}
              {proposal.unchanged > 0 && ` ${proposal.unchanged} visite${proposal.unchanged > 1 ? "s" : ""} ne bouge${proposal.unchanged > 1 ? "nt" : ""} pas.`}
            </p>
            <ul className="space-y-1.5">
              {proposal.moves.map((m) => {
                const on = !dropped.has(m.visit_id);
                return (
                  <li key={m.visit_id}>
                    <label className={cn("border-line flex cursor-pointer gap-3 rounded-lg border bg-white px-3 py-2.5", !on && "opacity-50")}>
                      <Checkbox
                        className="mt-1"
                        checked={on}
                        onCheckedChange={() =>
                          setDropped((d) => {
                            const next = new Set(d);
                            if (next.has(m.visit_id)) next.delete(m.visit_id);
                            else next.add(m.visit_id);
                            return next;
                          })
                        }
                        aria-label={`Garder le déplacement de ${m.doctor_name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-ink block text-sm font-medium">
                          {m.doctor_name} <span className="text-muted-foreground text-xs font-normal">{m.district}</span>
                        </span>
                        <span className="text-ink mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px]">
                          <span className="text-muted-foreground line-through">{formatTime(m.old_at)}</span>
                          <ArrowRight className="size-3.5" />
                          <span className="font-medium">
                            {m.kind === "decalee" ? formatTime(m.new_at) : `${formatLongDay(m.new_at)} à ${formatTime(m.new_at)}`}
                          </span>
                        </span>
                        <span className="text-muted-foreground mt-0.5 block text-xs">{m.why}.</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <DialogFooter>
          {proposal ? (
            <>
              <Button variant="outline" onClick={() => setProposal(null)}>
                Changer le motif
              </Button>
              <Button onClick={() => apply.mutate()} disabled={!kept || apply.isPending}>
                {apply.isPending && <Loader2 className="animate-spin" />} Valider {kept} déplacement{kept > 1 ? "s" : ""}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button onClick={() => propose.mutate()} disabled={propose.isPending || (reason === "medecin_absent" && !absent.length)}>
                {propose.isPending ? <Loader2 className="animate-spin" /> : <Zap />} Proposer une réorganisation
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
