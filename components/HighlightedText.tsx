import { Fragment } from "react";
import { splitHighlightMatches } from "@/lib/utils/highlightText";

export function HighlightedText({ text, query }: { text: string; query?: string }) {
  if (!query?.trim()) return text;

  return (
    <span>
      {splitHighlightMatches(text, query).map((segment, index) =>
        segment.isMatch ? (
          <mark
            key={`${index}-${segment.text}`}
            className="bg-[#ffe29a] text-inherit"
          >
            {segment.text}
          </mark>
        ) : (
          <Fragment key={`${index}-${segment.text}`}>{segment.text}</Fragment>
        )
      )}
    </span>
  );
}
