import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Home from "@/app/page";
import DecisionsPage from "@/app/decisions/page";
import MeetingsPage from "@/app/meetings/page";
import MeetingDetailPage from "@/app/meetings/[id]/page";
import TopicsPage from "@/app/topics/page";
import TopicDetailPage from "@/app/topics/[category]/page";
import SharedCardPage from "@/app/cards/[id]/page";
import FollowingPage from "@/app/following/page";
import AboutPage from "@/app/about/page";
import SubscribePage from "@/app/subscribe/page";
import PrivacyPage from "@/app/privacy/page";
import CookiesPage from "@/app/cookies/page";
import ElectionsPage from "@/app/elections/page";
import OfflinePage from "@/app/offline/page";

export const metadata: Metadata = {
  title: "SimpleCity Beta",
  robots: { index: false, follow: false }
};

type BetaPageProps = {
  params: Promise<{ path?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BetaPage({ params, searchParams }: BetaPageProps) {
  const [{ path = [] }, rawQuery] = await Promise.all([params, searchParams]);
  const query = Object.fromEntries(
    Object.entries(rawQuery).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])
  );
  const queryPromise = Promise.resolve(query);
  const route = path.join("/");

  if (path[0] === "categories" && path.length <= 2) {
    const suffix = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) suffix.set(key, value);
    const category = path[1] ? `/${encodeURIComponent(path[1])}` : "";
    redirect(`/beta/topics${category}${suffix.size ? `?${suffix}` : ""}`);
  }

  if (path.length === 2) {
    const id = Promise.resolve({ id: path[1] });
    if (path[0] === "cards") return <SharedCardPage params={id} />;
    if (path[0] === "meetings") return <MeetingDetailPage params={id} searchParams={queryPromise} />;
    if (path[0] === "topics") return <TopicDetailPage params={Promise.resolve({ category: path[1] })} searchParams={queryPromise} />;
  }

  switch (route) {
    case "": return <Home searchParams={queryPromise} />;
    case "decisions": return <DecisionsPage searchParams={queryPromise} />;
    case "meetings": return <MeetingsPage searchParams={queryPromise} />;
    case "topics": return <TopicsPage searchParams={queryPromise} />;
    case "following": return <FollowingPage />;
    case "about": return <AboutPage />;
    case "subscribe": return <SubscribePage searchParams={queryPromise} />;
    case "privacy": return <PrivacyPage searchParams={queryPromise} />;
    case "cookies": return <CookiesPage searchParams={queryPromise} />;
    case "elections": return <ElectionsPage searchParams={queryPromise} />;
    case "offline": return <OfflinePage />;
    default: notFound();
  }
}
