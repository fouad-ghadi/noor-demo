/** Visites passées dont le compte-rendu n'a pas encore été saisi. */
import { useQuery } from "@tanstack/react-query";
import { FileClock, FileText } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAgo, formatRelativeDay, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PendingReports({ delegueId, readOnly }: { delegueId: number; readOnly?: boolean }) {
  const filters = { pending_report: true, delegue_id: delegueId };
  const pending = useQuery({ queryKey: ["visits", filters], queryFn: () => api.visits(filters) });
  const list = [...(pending.data ?? [])].reverse(); // plus récentes d'abord
  if (!list.length) return null;

  return (
    <Card id="comptes-rendus" className="border-orange-200 scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileClock className="size-4 text-orange-600" /> Comptes-rendus à rédiger
        </CardTitle>
        <CardDescription>Ces visites sont passées mais n'ont pas encore de compte-rendu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {list.map((v) => {
          const late = Date.now() - new Date(v.planned_at).getTime() > 48 * 3600 * 1000;
          return (
            <div key={v.id} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-orange-50/60">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.doctor_name}</p>
                <p className={cn("text-xs", late ? "font-medium text-rose-700" : "text-muted-foreground")}>
                  {formatRelativeDay(v.planned_at)} à {formatTime(v.planned_at)}, {formatAgo(v.planned_at)}
                  {late && " — en retard"}
                </p>
              </div>
              {!readOnly && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/visites/${v.id}/compte-rendu`}>
                    <FileText /> Rédiger
                  </Link>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
