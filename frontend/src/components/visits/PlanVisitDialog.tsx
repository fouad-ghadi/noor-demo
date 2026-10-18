/**
 * Fenêtre « Planifier une visite ».
 * - Depuis la fiche médecin : le médecin est imposé (`doctor`).
 * - Depuis le planning : on choisit le médecin dans la liste.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, isWeekend } from "date-fns";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { TimeSlot } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { invalidateVisitData } from "@/hooks/queries";
import { formatDateTime, toApiDate } from "@/lib/format";
import { TIME_SLOT } from "@/lib/labels";

/** Créneaux horaires proposés : 08:00 → 19:00 toutes les 15 min. */
export const TIME_OPTIONS = Array.from({ length: 45 }, (_, i) => {
  const minutes = 8 * 60 + i * 15;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});

export const DEFAULT_TIME: Record<TimeSlot, string> = { matin: "09:30", midi: "12:30", apres_midi: "16:00" };

/** Prochain jour ouvré à partir de demain. */
function nextWorkingDay(): Date {
  let d = addDays(new Date(), 1);
  while (isWeekend(d)) d = addDays(d, 1);
  return d;
}

interface PlanVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctor?: { id: number; name: string; preferred_slot: TimeSlot | null };
  defaultDate?: Date;
  defaultTime?: string;
}

export function PlanVisitDialog({ open, onOpenChange, doctor, defaultDate, defaultTime }: PlanVisitDialogProps) {
  const queryClient = useQueryClient();
  const [doctorId, setDoctorId] = useState<string>("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:30");
  const [notes, setNotes] = useState("");

  // Liste des médecins (seulement si aucun médecin n'est imposé)
  const doctors = useQuery({ queryKey: ["doctors", {}], queryFn: () => api.doctors(), enabled: open && !doctor });
  const selected = doctor ?? (() => {
    const d = doctors.data?.find((x) => String(x.id) === doctorId);
    return d ? { id: d.id, name: `Dr ${d.first_name} ${d.last_name}`, preferred_slot: d.preferred_slot } : undefined;
  })();

  // Valeurs par défaut à chaque ouverture (dépendances = valeurs simples, pas des objets,
  // sinon l'effet se relancerait à chaque rendu et effacerait la saisie)
  const defaultDay = defaultDate ? toApiDate(defaultDate) : null;
  const preferredSlot = doctor?.preferred_slot ?? "matin";
  useEffect(() => {
    if (!open) return;
    setDate(defaultDay ?? toApiDate(nextWorkingDay()));
    setTime(defaultTime ?? DEFAULT_TIME[preferredSlot]);
    setNotes("");
    setDoctorId("");
  }, [open, defaultDay, defaultTime, preferredSlot]);

  const mutation = useMutation({
    mutationFn: () => api.planVisit(selected!.id, `${date}T${time}:00`, notes || undefined),
    onSuccess: (visit) => {
      invalidateVisitData(queryClient);
      toast.success("Visite planifiée", { description: `${visit.doctor_name} — ${formatDateTime(visit.planned_at)}` });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="size-5 text-pine" /> Planifier une visite
          </DialogTitle>
          <DialogDescription>{doctor ? doctor.name : "Choisissez le médecin, la date et l'heure."}</DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!selected) return toast.error("Choisissez un médecin");
            mutation.mutate();
          }}
        >
          {!doctor && (
            <div className="space-y-2">
              <Label>Médecin</Label>
              <Select
                value={doctorId}
                onValueChange={(v) => {
                  setDoctorId(v);
                  const d = doctors.data?.find((x) => String(x.id) === v);
                  if (d?.preferred_slot && !defaultTime) setTime(DEFAULT_TIME[d.preferred_slot]);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={doctors.isLoading ? "Chargement…" : "Choisir un médecin"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {doctors.data?.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      Dr {d.first_name} {d.last_name}, {d.specialty.toLowerCase()} ({d.segment})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="visit-date">Date</Label>
              <Input id="visit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
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
          {selected?.preferred_slot && (
            <p className="rounded-md bg-mint-wash px-3 py-2 text-xs text-pine">
              💡 Créneau préféré de ce médecin : <strong>{TIME_SLOT[selected.preferred_slot]}</strong>
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="visit-notes">Objectif de la visite (optionnel)</Label>
            <Textarea
              id="visit-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex. présenter le nouveau dosage, remettre l'étude…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending || !date}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Planifier
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
