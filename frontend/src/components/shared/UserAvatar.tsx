import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-semibold text-teal-800",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
