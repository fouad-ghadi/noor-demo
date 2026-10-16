import { cn } from "@/lib/utils";

/** Logo NOOR (« lumière » en arabe). */
export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-400 to-teal-700 font-bold text-white shadow-sm">
        N
      </div>
      <div className="leading-tight">
        <p className={cn("text-base font-bold tracking-wide", light ? "text-white" : "text-foreground")}>NOOR</p>
        <p className={cn("text-[11px]", light ? "text-sidebar-muted" : "text-muted-foreground")}>CRM Délégués médicaux</p>
      </div>
    </div>
  );
}
