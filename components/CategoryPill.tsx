import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { PendingLink } from "@/components/PendingLink";

export function CategoryPill({
  category,
  href,
  compact = false
}: {
  category: string;
  href?: string;
  compact?: boolean;
}) {
  const definition = CATEGORY_DEFINITIONS[category as CategoryName];
  const className = cn(
    "inline-flex items-center gap-1.5 rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-semibold text-black/75 shadow-sm transition hover:bg-black/[0.03] focus-visible:focus-ring whitespace-nowrap",
    compact ? "px-2.5" : "px-3"
  );

  const content = (
    <>
      {definition?.icon ? <definition.icon aria-hidden className="h-3.5 w-3.5 shrink-0" /> : null}
      <span>{category}</span>
    </>
  );

  if (href) {
    return (
      <PendingLink
        href={href}
        className={cn(className, "focus-visible:focus-ring")}
        pendingLabel="Loading"
      >
        {content}
      </PendingLink>
    );
  }

  return <span className={className}>{content}</span>;
}
