import { STATUS_TONES } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";

export function StatusPill({ status }: { status?: string | null }) {
  const label = status || "Unknown";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm",
        STATUS_TONES[label] || "border-black/15 bg-black/5 text-black/70"
      )}
    >
      {label}
    </span>
  );
}
