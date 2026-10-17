import { NoorMark } from "@/components/brand/NoorMark";
import { cn } from "@/lib/utils";

/** Logo NOOR : emblème (étoile à huit branches) + nom. */
export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <NoorMark className="size-8" color={light ? "#5eead4" : "#0d9488"} core={light ? "#0f3d3e" : "#ffffff"} />
      <div className="leading-tight">
        <p className={cn("font-display text-[17px] font-bold tracking-wide", light ? "text-white" : "text-foreground")}>NOOR</p>
        <p className={cn("text-[11px]", light ? "text-sidebar-muted" : "text-muted-foreground")}>CRM Délégués médicaux</p>
      </div>
    </div>
  );
}
