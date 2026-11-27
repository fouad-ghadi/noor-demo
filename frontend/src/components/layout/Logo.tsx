import { SothemaBadge } from "@/components/brand/SothemaLogo";
import { cn } from "@/lib/utils";

/** Logo NOOR : logo Sothema (pastille blanche) + nom du CRM. */
export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <SothemaBadge className={light ? undefined : "ring-line ring-1"} />
      <div className="leading-tight">
        <p className={cn("font-display text-[17px] font-bold tracking-wide", light ? "text-white" : "text-foreground")}>NOOR</p>
        <p className={cn("text-[11px]", light ? "text-sidebar-muted" : "text-muted-foreground")}>CRM Délégués médicaux</p>
      </div>
    </div>
  );
}
