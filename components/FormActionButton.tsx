"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export function FormActionButton({
  children,
  pendingLabel,
  className
}: {
  children: string;
  pendingLabel?: string;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const label = pending ? pendingLabel || children : children;

  return (
    <button
      type="submit"
      disabled={pending}
      onClick={() => setPending(true)}
      className={cn(className, pending && "pointer-events-none")}
    >
      {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {label}
    </button>
  );
}
