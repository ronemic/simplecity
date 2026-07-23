"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ListboxSelect } from "@/components/ListboxSelect";
import type { Locale } from "@/lib/i18n";
import type { DecisionResultFilter } from "@/lib/utils/decisionResultFilter";

const RESULT_OPTIONS: Array<{
  value: DecisionResultFilter;
  en: string;
  es: string;
}> = [
  { value: "approved", en: "Approved", es: "Aprobadas" },
  { value: "rejected", en: "Rejected", es: "Rechazadas" },
  { value: "continued", en: "Continued", es: "Continuadas" },
  { value: "amended", en: "Amended", es: "Enmendadas" },
  { value: "awaiting", en: "Awaiting result", es: "Esperando resultado" }
];

export function DecisionResultSelect({
  selectedResult,
  locale
}: {
  selectedResult?: DecisionResultFilter;
  locale: Locale;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const options = [
    { value: "", label: locale === "es" ? "Todos los resultados" : "All results" },
    ...RESULT_OPTIONS.map((option) => ({
      value: option.value,
      label: locale === "es" ? option.es : option.en
    }))
  ];

  function updateResult(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("result", value);
    else params.delete("result");
    params.delete("page");
    const query = params.toString();

    startTransition(() => {
      router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    });
  }

  return (
    <div aria-busy={isPending} className="flex items-center gap-2">
      {isPending ? <Loader2 aria-hidden className="h-3.5 w-3.5 shrink-0 animate-spin text-civic" /> : null}
      <ListboxSelect
        key={`result-${selectedResult || "all"}`}
        name="result"
        label={locale === "es" ? "Filtrar por resultado" : "Filter by result"}
        value={selectedResult || ""}
        options={options}
        onValueChange={updateResult}
        prefix={locale === "es" ? "Filtrar por resultado" : "Filter by result"}
        className="w-64 max-w-[82vw] sm:w-72"
        compact
      />
    </div>
  );
}
