/**
 * Fenêtre « Annuler / reporter la visite ».
 * - Annuler : la visite passe en « annulée ».
 * - Reporter : la visite passe en « reportée » et une nouvelle visite est planifiée.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, format, parseISO } from "date-fns";
import { CalendarX2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { Visit } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invalidateVisitData } from "@/hooks/queries";
import { TIME_OPTIONS } from "./PlanVisitDialog";

/** Motifs fréquents (le délégué peut aussi écrire le sien). */
const REASONS = [
  "Médecin absent (congé)",
  "Rendez-vous annulé par le secrétariat",
  "Urgence à l'hôpital, médecin indisponible",
  "Cabinet fermé exceptionnellement",
  "Médecin en formation (congrès)",
  "Retard sur la tournée",
];
const OTHER = "__autre__";

interface Props {
  visit: Visit | null;
  onOpenChange: (open: boolean) => void;
}

export function CancelVisitDialog({ visit, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"annuler" | "reporter">("reporter");
  const [reason, setReason] = useState(REASONS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:30");

  useEffect(() => {
    if (!visit) return;
    const d = parseISO(visit.planned_at);
    setMode("reporter");
    setReason(REASONS[0]);
    setOtherReason("");
    setDate(format(addDays(d, 7), "yyyy-MM-dd"));
    const t = format(d, "HH:mm");
    setTime(TIME_OPTIONS.includes(t) ? t : "09:30");
  }, [visit]);

  const finalReason = reason === OTHER ? otherReason.trim() : reason;
  const mutation = useMutation({
    mutationFn: () =>
      api.cancelVisit(visit!.id, finalReason, mode === "reporter", mode === "reporter" ? `${date}T${time}:00` : undefined),
    onSuccess: () => {
      invalidateVisitData(queryClient);
      toast.success(mode === "reporter" ? "Visite reportée" : "Visite annulée", { description: visit?.doctor_name });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!visit} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarX2 className="size-5 text-rose-600" /> Annuler ou reporter
          </DialogTitle>
          <DialogDescription>{visit?.doctor_name}</DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <TabsList className="w-full">
            <TabsTrigger value="reporter">Reporter</TabsTrigger>
            <TabsTrigger value="annuler">Annuler</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-2">
          <Label>Motif</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
              <SelectItem value={OTHER}>Autre motif…</SelectItem>
            </SelectContent>
          </Select>
          {reason === OTHER && (
            <Input autoFocus placeholder="Précisez le motif" value={otherReason} onChange={(e) => setOtherReason(e.target.value)} />
          )}
        </div>

        {mode === "reporter" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="postpone-date">Nouvelle date</Label>
              <Input id="postpone-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Retour
          </Button>
          <Button
            variant={mode === "annuler" ? "destructive" : "default"}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !finalReason || (mode === "reporter" && !date)}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            {mode === "reporter" ? "Reporter la visite" : "Annuler la visite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
