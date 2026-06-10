"use client";

import { Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export function ScraperRunStatus({ jurisdiction = "san-mateo-city" }: { jurisdiction?: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasIssue, setHasIssue] = useState(false);

  async function runScraper() {
    setLoading(true);
    setMessage("Starting scraper...");
    setHasIssue(false);

    try {
      const response = await fetch("/api/admin/run-scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jurisdiction })
      });
      const body = await response.json();
      const errors = Array.isArray(body.errors) ? body.errors : [];
      const logTail = Array.isArray(body.logs) ? body.logs.slice(-4) : [];
      const issue = !response.ok || body.status !== "success" || errors.length > 0;

      if (!response.ok) throw new Error(body.error || errors.join("\n") || "Scraper run failed.");

      setHasIssue(issue);
      setMessage([
        `Finished with ${body.status}: ${body.meetingsFound} meetings, ${body.documentsDownloaded} documents, ${body.cardsGenerated} cards.`,
        errors.length > 0 ? `Issues:\n${errors.join("\n")}` : "",
        issue && logTail.length > 0 ? `Recent logs:\n${logTail.join("\n")}` : ""
      ].filter(Boolean).join("\n\n"));
    } catch (error) {
      setHasIssue(true);
      setMessage(error instanceof Error ? error.message : "Scraper run failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="quiet-card p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-ink">Manual scraper run</h2>
          <p className="mt-1 text-sm text-black/70">
            Scrape PrimeGov, extract PDFs, summarize, and save cards for the selected jurisdiction.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={runScraper}
          className="action-primary"
        >
          {loading ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />}
          Run scraper now
        </button>
      </div>
      {message ? (
        <p
          className={cn(
            "mt-4 whitespace-pre-wrap rounded-lg p-4 text-sm leading-6",
            hasIssue ? "border border-clay/25 bg-clay/10 text-[#7a2f1d]" : "bg-black/5 text-black/75"
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
