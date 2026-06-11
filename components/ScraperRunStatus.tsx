"use client";

import { Play, RefreshCw } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

type ScraperRunResponse = {
  error?: string;
  status?: string;
  jurisdiction?: string;
};

export function ScraperRunStatus({ jurisdiction = "san-mateo-city" }: { jurisdiction?: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [hasIssue, setHasIssue] = useState(false);

  async function runScraper() {
    setLoading(true);
    setMessage("Starting scraper in the background...");
    setHasIssue(false);

    try {
      const params = new URLSearchParams({ background: "true", jurisdiction });
      const response = await fetch(`/api/scrape?${params.toString()}`, { method: "POST" });
      const rawBody = await response.text();
      let body: ScraperRunResponse = {};
      try {
        body = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        body = {};
      }

      if (!response.ok) {
        throw new Error(
          body.error ||
            rawBody ||
            `Could not start scraper with HTTP ${response.status}. Check Render logs for the server error.`
        );
      }

      setHasIssue(false);
      setMessage(
        body.status === "already_running"
          ? `A scraper is already running for ${body.jurisdiction || jurisdiction}. Check scraper runs again in a few minutes.`
          : `Scraper started in the background for ${body.jurisdiction || jurisdiction}. It can take several minutes to finish.`
      );
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
            Start the PrimeGov scraper for the selected jurisdiction without waiting for it to finish in this request.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={runScraper}
          className="action-primary"
        >
          {loading ? <RefreshCw aria-hidden className="h-4 w-4 animate-spin" /> : <Play aria-hidden className="h-4 w-4" />}
          Start scraper
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
