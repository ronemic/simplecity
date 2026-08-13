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
        "state",
        STATUS_TONES[label] || "state--decided"
      )}
    >
      <HighlightedText text={displayLabel} query={highlight} />
    </span>
  );
}
