import { STATUS_TONES } from "@/lib/constants";
import { HighlightedText } from "@/components/HighlightedText";
import { cn } from "@/lib/utils/cn";
import { type Locale, statusLabel } from "@/lib/i18n";

export function StatusPill({
  status,
  locale = "en",
  highlight
}: {
  status?: string | null;
  locale?: Locale;
  highlight?: string;
}) {
  const label = status || "Unknown";
  const displayLabel = statusLabel(locale, label);

  return (
    <span
      className={cn(
        "status-pill",
        STATUS_TONES[label] || "border-black/20 bg-black/5 text-black/70"
      )}
    >
      <HighlightedText text={displayLabel} query={highlight} />
    </span>
  );
}
