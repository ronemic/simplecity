import { STATUS_TONES } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { type Locale, statusLabel } from "@/lib/i18n";

export function StatusPill({ status, locale = "en" }: { status?: string | null; locale?: Locale }) {
  const label = status || "Unknown";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold shadow-sm",
        STATUS_TONES[label] || "border-black/20 bg-black/5 text-black/70"
      )}
    >
      {statusLabel(locale, label)}
    </span>
  );
}
