/**
 * Fenêtre « Ajouter un événement » : réunion, formation, congrès, congé...
 * Un événement retire la journée (ou la demi-journée) des jours travaillés sur le terrain,
 * ce qui est pris en compte dans la moyenne de visites par jour (page Statistiques).
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { EventType } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, toApiDate } from "@/lib/format";
import { EVENT_TYPE } from "@/lib/labels";

const WHOLE_DAY = "journee";
const HALVES = { [WHOLE_DAY]: "Journée entière", matin: "Matin", apres_midi: "Après-midi" } as const;

export function EventDialog({ open, onOpenChange, defaultDate }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
}) {
  const queryClient = useQueryClient();
  const [day, setDay] = useState("");
  const [type, setType] = useState<EventType>("formation");
  const [half, setHalf] = useState<keyof typeof HALVES>(WHOLE_DAY);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!open) return;
    setDay(toApiDate(defaultDate ?? new Date()));
    setType("formation");
    setHalf(WHOLE_DAY);
    setComment("");
  }, [open, defaultDate]);

  const mutation = useMutation({
    mutationFn: () =>
      api.createEvent({ day, type, half: half === WHOLE_DAY ? null : half, comment: comment.trim() || null }),
    onSuccess: (e) => {
      for (const key of ["events", "activity", "dashboard"]) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success("Événement ajouté", { description: `${EVENT_TYPE[e.type]}, ${formatDate(e.day)}` });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajouter un événement</DialogTitle>
          <DialogDescription>
            Réunion, formation, congrès, congé : ces jours ne comptent pas comme jours de terrain.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label>Type d'événement</Label>
            <Select value={type} onValueChange={(v) => setType(v as EventType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(EVENT_TYPE) as EventType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {EVENT_TYPE[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="event-day">Date</Label>
              <Input id="event-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Durée</Label>
              <Select value={half} onValueChange={(v) => setHalf(v as keyof typeof HALVES)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(HALVES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-comment">Précision (facultatif)</Label>
            <Input
              id="event-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Ex. formation produit Statilia"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending || !day}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
