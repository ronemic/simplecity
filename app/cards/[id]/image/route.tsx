import { ImageResponse } from "next/og";
import { getPublishedCard } from "@/lib/db/queries";
import {
  cardJurisdictionLabel,
  cardGroupLabel,
  cardShareTitle,
  cardSummaryPoints
} from "@/lib/utils/cardShare";
import { formatCompactDisplayDate } from "@/lib/utils/date";
import { getCommentDeadlineInfo, hasCommentOptionInfo } from "@/lib/utils/commentDeadline";

export const revalidate = 300;

function SimpleCityMark() {
  return (
    <svg width="42" height="42" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="12" fill="#2457a6" />
      <g
        transform="translate(12 12) scale(1.6667)"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="3" x2="21" y1="22" y2="22" />
        <line x1="6" x2="6" y1="18" y2="11" />
        <line x1="10" x2="10" y1="18" y2="11" />
        <line x1="14" x2="14" y1="18" y2="11" />
        <line x1="18" x2="18" y1="18" y2="11" />
        <polygon points="12 2 20 7 4 7" />
      </g>
    </svg>
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const card = await getPublishedCard(id, "en");
  if (!card) return new Response("Card not found", { status: 404 });

  const title = cardShareTitle(card);
  const summaryPoints = cardSummaryPoints(card, "en").slice(0, 2);
  const meetingDate = formatCompactDisplayDate(
    card.meetings?.date_text,
    card.meetings?.meeting_datetime
  );
  const category = (card.category_tags || [])[0] || "Local decision";
  const commentInput = {
    closes: card.comment_window_closes,
    actionTexts: [card.how_to_act_submit_comment, card.how_to_act_email]
  };
  const deadline = getCommentDeadlineInfo(commentInput);
  const hasComment = hasCommentOptionInfo(commentInput);
  const rawStatus = card.status || card.meetings?.status || "Information only";
  const status = deadline
    ? `Comment deadline ${formatCompactDisplayDate(deadline.value)}`
    : hasComment
      ? "Comment option listed"
      : rawStatus;
  const statusStyle = deadline
    ? { border: "#e7ba6a", background: "#fff7e8", color: "#7a4808" }
    : hasComment
      ? { border: "#9fc6b2", background: "#f1fbf4", color: "#24613c" }
      : rawStatus === "Under discussion"
        ? { border: "#e7ba6a", background: "#fff7e8", color: "#7a4808" }
        : { border: "#bed0dc", background: "#eef3f6", color: "#12365f" };
  const whyItMatters = String(card.why_it_matters || "See the official source for details.")
    .replace(/\s+/g, " ")
    .trim();
  const howToAct = String(
    card.how_to_act_submit_comment || card.how_to_act_email || card.how_to_act_attend || "See the official meeting details."
  )
    .replace(/\s+/g, " ")
    .trim();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "radial-gradient(circle at 12% -10%, rgba(36,87,166,0.16), transparent 460px), linear-gradient(180deg, #f8fafb 0%, #eef3f6 100%)",
          color: "#171717",
          padding: "34px 50px 40px",
          fontFamily: "sans-serif"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 48, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, fontSize: 25, fontWeight: 700 }}>
            <SimpleCityMark />
            <div style={{ display: "flex" }}>SimpleCity</div>
          </div>
          <div style={{ display: "flex", color: "#2457a6", fontSize: 17, fontWeight: 700 }}>
            Plain-language local decisions
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            overflow: "hidden",
            border: "1px solid rgba(23,23,23,0.12)",
            borderRadius: 14,
            background: "white",
            boxShadow: "0 18px 48px rgba(23,23,23,0.10)"
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", padding: "26px 34px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", color: "rgba(23,23,23,0.62)", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {cardGroupLabel(card, "en")} · {cardJurisdictionLabel(card)}
            </div>
            <div style={{ display: "flex", fontSize: title.length > 74 ? 35 : 40, lineHeight: 1.08, fontWeight: 700, letterSpacing: "-0.8px", maxHeight: 88, overflow: "hidden" }}>
              {title}
            </div>
            <div style={{ display: "flex", marginTop: 10, color: "rgba(23,23,23,0.64)", fontSize: 18, lineHeight: 1.4, fontWeight: 600, maxHeight: 52, overflow: "hidden" }}>
              {summaryPoints[0]}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16, color: "rgba(23,23,23,0.64)", fontSize: 16, fontWeight: 700 }}>
              <div style={{ display: "flex", border: `1px solid ${statusStyle.border}`, background: statusStyle.background, borderRadius: 7, padding: "7px 12px", color: statusStyle.color }}>
                {status}
              </div>
              <div style={{ display: "flex" }}>
                {meetingDate}
              </div>
              <div style={{ display: "flex", borderLeft: "1px solid rgba(23,23,23,0.14)", paddingLeft: 16 }}>
                {category}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flex: 1, borderTop: "1px solid rgba(23,23,23,0.10)", background: "#f8fafb", padding: "22px 34px 24px", gap: 30 }}>
            <div style={{ display: "flex", flex: 1.15, flexDirection: "column" }}>
              <div style={{ display: "flex", color: "#2457a6", fontSize: 14, fontWeight: 700, marginBottom: 9 }}>
                WHAT&apos;S HAPPENING
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, color: "rgba(23,23,23,0.76)", fontSize: 16, lineHeight: 1.38, maxHeight: 102, overflow: "hidden" }}>
                {summaryPoints.map((point) => (
                  <div key={point} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ display: "flex", width: 6, height: 6, flexShrink: 0, marginTop: 8, borderRadius: 999, background: "#2457a6" }} />
                    <div style={{ display: "flex" }}>{point}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", flex: 0.85, flexDirection: "column" }}>
              <div style={{ display: "flex", color: "rgba(23,23,23,0.55)", fontSize: 14, fontWeight: 700, marginBottom: 9 }}>
                WHY IT MATTERS
              </div>
              <div style={{ display: "flex", color: "rgba(23,23,23,0.76)", fontSize: 16, lineHeight: 1.42, maxHeight: 96, overflow: "hidden" }}>
                {whyItMatters}
              </div>
            </div>
            <div style={{ display: "flex", flex: 0.9, flexDirection: "column" }}>
              <div style={{ display: "flex", color: "#8e452e", fontSize: 14, fontWeight: 700, marginBottom: 9 }}>
                HOW TO ACT
              </div>
              <div style={{ display: "flex", color: "rgba(23,23,23,0.76)", fontSize: 16, lineHeight: 1.42, maxHeight: 96, overflow: "hidden" }}>
                {howToAct}
              </div>
            </div>
          </div>
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
