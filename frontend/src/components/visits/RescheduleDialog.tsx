/** Fenêtre « Déplacer la visite » : nouvelle date + nouvelle heure. */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { Visit } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invalidateVisitData } from "@/hooks/queries";
import { formatDateTime } from "@/lib/format";
import { TIME_OPTIONS } from "./PlanVisitDialog";

interface Props {
  visit: Visit | null;
  onOpenChange: (open: boolean) => void;
}

export function RescheduleDialog({ visit, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");

  useEffect(() => {
    if (!visit) return;
    const d = parseISO(visit.planned_at);
    setDate(format(d, "yyyy-MM-dd"));
    const t = format(d, "HH:mm");
    setTime(TIME_OPTIONS.includes(t) ? t : "09:00");
  }, [visit]);

  const mutation = useMutation({
    mutationFn: () => api.rescheduleVisit(visit!.id, `${date}T${time}:00`),
    onSuccess: (v) => {
      invalidateVisitData(queryClient);
      toast.success("Visite déplacée", { description: `${v.doctor_name} — ${formatDateTime(v.planned_at)}` });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!visit} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-teal-700" /> Déplacer la visite
          </DialogTitle>
          <DialogDescription>
            {visit?.doctor_name} — actuellement le {visit && formatDateTime(visit.planned_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="move-date">Nouvelle date</Label>
            <Input id="move-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !date}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Déplacer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
