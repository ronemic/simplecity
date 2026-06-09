import Link from "next/link";
import { CATEGORY_DEFINITIONS, type CategoryName } from "@/lib/constants";
import { cn } from "@/lib/utils/cn";

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
    "inline-flex items-center gap-1.5 rounded-md border font-medium",
    compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
    definition?.tone || "border-black/15 bg-black/5 text-black/70"
  );

  const content = (
    <>
      {definition?.icon ? <definition.icon aria-hidden className="h-3.5 w-3.5" /> : null}
      <span>{category}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn(className, "transition hover:brightness-95 focus-visible:focus-ring")}>
        {content}
      </Link>
    );
  }

  return <span className={className}>{content}</span>;
}
