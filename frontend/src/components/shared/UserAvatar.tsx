import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full bg-mint-wash text-pine font-display text-sm font-semibold",
        className,
      )}
    >
      {initials(name)}
    </div>
  );
}
