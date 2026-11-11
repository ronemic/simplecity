import { PreviewLoading } from "@/components/local-redesign/PreviewLoading";
import { isBetaRequest } from "@/lib/localRedesign";

export default async function TopicDetailLoading() {
  if (await isBetaRequest()) return <PreviewLoading />;
  return (
    <div className="section-shell py-10">
      <div className="max-w-3xl">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-lg bg-black/10" />
          <div className="h-12 w-72 animate-pulse rounded-md bg-black/10" />
        </div>
        <div className="mt-3 h-6 w-full max-w-2xl animate-pulse rounded-md bg-black/10" />
      </div>
      <div className="mt-6 flex gap-2">
        <div className="h-10 w-20 animate-pulse rounded-lg bg-black/10" />
        <div className="h-10 w-24 animate-pulse rounded-lg bg-black/10" />
        <div className="h-10 w-20 animate-pulse rounded-lg bg-black/10" />
      </div>
      <div className="mt-8 space-y-4">
        <div className="h-60 animate-pulse rounded-lg bg-black/10" />
        <div className="h-60 animate-pulse rounded-lg bg-black/10" />
      </div>
    </div>
  );
}
