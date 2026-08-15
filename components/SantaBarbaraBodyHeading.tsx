"use client";

import { Check, ChevronDown } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PendingLink } from "@/components/PendingLink";
import type { Locale } from "@/lib/i18n";
import type { SantaBarbaraBodyView } from "@/lib/utils/santaBarbaraBody";

export function SantaBarbaraBodyHeading({
  activeBody,
  locale,
  page
}: {
  activeBody: SantaBarbaraBodyView;
  locale: Locale;
  page: "decisions" | "meetings";
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const options = [
    {
      value: "all" as const,
      label:
        page === "meetings"
          ? locale === "es" ? "Todas las reuniones" : "All meetings"
          : locale === "es" ? "Todas las decisiones" : "All decisions",
      description:
        locale === "es"
          ? "Junta de Supervisores y Comisión de Planificación"
          : "Board of Supervisors and Planning Commission"
    },
    {
      value: "board" as const,
      label:
        page === "meetings"
          ? locale === "es" ? "Reuniones de la Junta de Supervisores" : "Board of Supervisors meetings"
          : locale === "es" ? "Decisiones de la Junta de Supervisores" : "Board of Supervisors decisions",
      description: locale === "es" ? "Decisiones finales del condado" : "Final county decisions"
    },
    {
      value: "planning" as const,
      label:
        page === "meetings"
          ? locale === "es" ? "Reuniones de la Comisión de Planificación" : "Planning Commission meetings"
          : locale === "es" ? "Recomendaciones de la Comisión de Planificación" : "Planning Commission recommendations",
      description:
        locale === "es" ? "Órgano asesor; no son decisiones finales" : "Advisory body; recommendations are not final"
    }
  ];
  const selected = options.find((option) => option.value === activeBody) || options[0];

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function href(body: SantaBarbaraBodyView) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("body", body);
    if (body === "planning") params.delete("result");
    params.delete("page");
    const query = params.toString();
    return `${pathname}${query ? `?${query}` : ""}`;
  }

  return (
    <div ref={containerRef} className="relative mt-2 w-fit max-w-full">
      <h1>
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="group flex max-w-full items-start gap-2 text-left text-3xl font-black leading-tight text-ink focus-visible:focus-ring sm:text-4xl"
        >
          <span className="text-balance">{selected.label}</span>
          <ChevronDown
            aria-hidden
            className={`mt-2 h-5 w-5 shrink-0 text-civic transition-transform sm:mt-3 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h1>
      {open ? (
        <div className="menu-popover !left-0 !w-[min(28rem,calc(100vw-2rem))] py-1" role="listbox" aria-label={locale === "es" ? "Órgano del condado" : "County body"}>
          {options.map((option) => {
            const isSelected = option.value === activeBody;
            return (
              <PendingLink
                key={option.value}
                href={href(option.value)}
                role="option"
                aria-selected={isSelected}
                pendingLabel={locale === "es" ? `Abriendo ${option.label}` : `Opening ${option.label}`}
                className={`grid grid-cols-[1.25rem_1fr] gap-2 px-3 py-2.5 transition hover:bg-[#eef4f8] ${isSelected ? "bg-[#eef4f8]" : ""}`}
              >
                <Check aria-hidden className={`mt-0.5 h-4 w-4 text-civic ${isSelected ? "opacity-100" : "opacity-0"}`} />
                <span>
                  <span className="block text-sm font-black text-ink">{option.label}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-black/55">{option.description}</span>
                </span>
              </PendingLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
