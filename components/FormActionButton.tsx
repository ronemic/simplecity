"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

export function FormActionButton({
  children,
  pendingLabel,
  className
}: {
  children: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const label = pending ? pendingLabel || children : children;

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
      {label}
    </button>
  );
}
