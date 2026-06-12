"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type Option = {
  value: string;
  label: string;
};

export function ListboxSelect({
  name,
  label,
  value,
  options,
  className
}: {
  name: string;
  label: string;
  value: string;
  options: Option[];
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === selectedValue) || options[0];

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative ${className || ""}`.trim()}>
      <input type="hidden" name={name} value={selectedValue} />
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex min-h-12 w-full items-center justify-between gap-2 rounded-lg border border-black/20 bg-white px-4 py-3 text-left text-base font-semibold text-ink shadow-sm transition hover:border-black/40 hover:bg-black/[0.025] focus-visible:focus-ring"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="truncate">{selectedOption?.label || label}</span>
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-black/60 transition ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-full overflow-hidden rounded-lg border border-black/20 bg-white py-1 shadow-soft">
          <div role="listbox" aria-label={label} className="max-h-64 overflow-auto">
            {options.map((option) => {
              const isSelected = option.value === selectedValue;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`grid min-h-10 w-full grid-cols-[1.25rem_1fr] items-center gap-2 px-3 py-2 text-left text-sm font-bold transition ${
                    isSelected
                      ? "bg-civic text-white"
                      : "text-ink hover:bg-black/[0.04] focus-visible:bg-black/[0.04]"
                  }`}
                  onClick={() => {
                    setSelectedValue(option.value);
                    setIsOpen(false);
                  }}
                >
                  <Check
                    aria-hidden="true"
                    className={`h-4 w-4 ${isSelected ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
