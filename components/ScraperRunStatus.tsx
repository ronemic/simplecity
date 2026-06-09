"use client";

import { Play, RefreshCw } from "lucide-react";
import { useState } from "react";

export function ScraperRunStatus() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function runScraper() {
    setLoading(true);
    setMessage("Starting scraper...");

    try {
      const response = await fetch("/api/admin/run-scraper", { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Scraper run failed.");

      setMessage(
        `Finished with ${body.status}: ${body.meetingsFound} meetings, ${body.documentsDownloaded} documents, ${body.cardsGenerated} cards.`
      );
    } catch (error) {
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
          <p className="mt-1 text-sm text-black/60">Scrape PrimeGov, extract PDFs, summarize, and save cards.</p>
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
      {message ? <p className="mt-4 rounded-2xl bg-black/5 p-4 text-sm text-black/70">{message}</p> : null}
    </div>
  );
}
