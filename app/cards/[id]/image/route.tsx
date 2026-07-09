import { ImageResponse } from "next/og";
import { getPublishedCard } from "@/lib/db/queries";
import {
  cardJurisdictionLabel,
  cardGroupLabel,
  cardMeetingDate,
  cardShareTitle,
  cardSummaryPoints
} from "@/lib/utils/cardShare";

export const revalidate = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const card = await getPublishedCard(id, "en");
  if (!card) return new Response("Card not found", { status: 404 });

  const title = cardShareTitle(card);
  const summaryPoints = cardSummaryPoints(card, "en").slice(0, 2);
  const status = card.status || card.meetings?.status || "Local decision";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f4f7fa",
          color: "#171717",
          padding: "64px 72px",
          fontFamily: "Arial, sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 27, fontWeight: 800 }}>
            <div style={{ display: "flex", width: 48, height: 48, borderRadius: 12, background: "#2457a6", color: "white", alignItems: "center", justifyContent: "center", fontSize: 27 }}>
              S
            </div>
            SimpleCity
          </div>
          <div style={{ display: "flex", border: "2px solid #c6d6e7", background: "white", borderRadius: 999, padding: "10px 18px", color: "#2457a6", fontSize: 21, fontWeight: 700 }}>
            {status}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", maxWidth: 1030 }}>
          <div style={{ display: "flex", color: "#536273", fontSize: 20, fontWeight: 700, marginBottom: 18 }}>
            {cardGroupLabel(card, "en")} · {cardJurisdictionLabel(card)} · {cardMeetingDate(card)}
          </div>
          <div style={{ display: "flex", fontSize: title.length > 70 ? 42 : 50, lineHeight: 1.08, fontWeight: 900, letterSpacing: "-1.2px" }}>
            {title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20, gap: 9, color: "#3e4852", maxHeight: 174, overflow: "hidden" }}>
            {summaryPoints.map((point) => (
              <div key={point} style={{ display: "flex", alignItems: "flex-start", gap: 14, fontSize: 21, lineHeight: 1.32 }}>
                <div style={{ display: "flex", width: 8, height: 8, flexShrink: 0, marginTop: 9, borderRadius: 999, background: "#2457a6" }} />
                <div style={{ display: "flex" }}>{point}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #dce4eb", paddingTop: 24, color: "#536273", fontSize: 20 }}>
          <div style={{ display: "flex" }}>Plain-language local government updates</div>
          <div style={{ display: "flex", fontWeight: 800, color: "#2457a6" }}>simplecity.app</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        "Content-Disposition": `inline; filename="simplecity-${id}.png"`,
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400"
      }
    }
  );
}
