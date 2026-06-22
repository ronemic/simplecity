import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";
import { PendingLink } from "@/components/PendingLink";

export function CategoryPill({
  category,
  href,
  compact = false,
  large = false,
  selected = false
}: {
  category: string;
  href?: string;
  compact?: boolean;
  large?: boolean;
  selected?: boolean;
}) {
  const definition = CATEGORY_DEFINITIONS[category as CategoryName];
  const className = cn(
    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-black/15 bg-white font-semibold text-black/75 shadow-sm transition hover:bg-black/[0.03] focus-visible:focus-ring",
    compact
      ? "px-2.5 py-1 text-xs"
      : large
        ? "min-h-9 px-3.5 py-1.5 text-sm"
        : "px-3 py-1 text-xs",
    selected && "border-civic/35 bg-civic/10 text-civic hover:bg-civic/15"
  );

  const content = (
    <>
      {definition?.icon ? (
        <definition.icon aria-hidden className={large ? "h-4 w-4 shrink-0" : "h-3.5 w-3.5 shrink-0"} />
      ) : null}
      <span>{category}</span>
    </>
  );

  if (href) {
    return (
      <PendingLink
        href={href}
        aria-current={selected ? "true" : undefined}
        className={cn(className, "focus-visible:focus-ring")}
        pendingLabel="Loading"
      >
        {content}
      </PendingLink>
    );
  }

  return <span className={className}>{content}</span>;
}
