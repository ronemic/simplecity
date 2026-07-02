import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { PendingLink } from "@/components/PendingLink";
import { categoryLabel, type Locale, t } from "@/lib/i18n";

export function CategoryPill({
  category,
  href,
  compact = false,
  large = false,
  selected = false,
  locale = "en"
}: {
  category: string;
  href?: string;
  compact?: boolean;
  large?: boolean;
  selected?: boolean;
  locale?: Locale;
}) {
  const definition = CATEGORY_DEFINITIONS[category as CategoryName];
  const className = cn(
    "chip",
    compact
      ? "chip-compact"
      : large
        ? "chip-lg"
        : "",
    selected && "chip-selected"
  );

  const content = (
    <>
      {definition?.icon ? (
        <definition.icon aria-hidden className={large ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
      ) : null}
      <span>{categoryLabel(locale, category)}</span>
    </>
  );

  if (href) {
    return (
      <PendingLink
        href={href}
        aria-current={selected ? "true" : undefined}
        className={cn(className, "focus-visible:focus-ring")}
        pendingLabel={t(locale, "loading")}
      >
        {content}
      </PendingLink>
    );
  }

  return <span className={className}>{content}</span>;
}
